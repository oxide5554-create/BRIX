// ============================================================
//  brix • rust/brix-utils/src/bin/brix-ping.rs
//  УТИЛИТА ДИАГНОСТИКИ ПИНГА (просьба игрока: «у игроков до 800 пинга —
//  сделайте ping файл на Rust»). Без зависимостей, только std.
//
//  Замеряет задержку ДО СЕРВЕРА BRIX тремя способами:
//    tcp  — чистое TCP-соединение (нижняя граница задержки канала);
//    http — GET /ping (полный цикл HTTP: так ходят /status и лут-запросы);
//    ws   — WebSocket handshake + ping/pong (ИМЕННО так пингует игра).
//
//  ПРИМЕРЫ:
//    brix-ping ws localhost:8787
//    brix-ping tcp 192.168.1.5:8787 20
//    brix-ping http http://localhost:8787/status 15
//    brix-ping ws lpxm82mp-8787.euw.devtunnels.ms 20     (wss сам поймётся как ws://)
//
//  КАК ЧИТАТЬ РЕЗУЛЬТАТ:
//    tcp маленький, а ws большой  → задержку добавляет протокол/сервер;
//    локальный ws маленький, а через туннель большой
//                                 → задержку добавляет ТУННЕЛЬ (Dev Tunnels
//                                   гоняет трафик через Европу — это
//                                   инфраструктура, не код игры);
//    джиттер большой             → сеть «дёргается» (Wi-Fi/мобильный интернет).
// ============================================================
use brix_utils::{http_rtt, parse_target, stats, tcp_rtt, ws_rtt, Scheme};
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_millis(4000);

fn colorize(ms: f64, s: String) -> String {
    // ANSI-цвета: в старой консоли Windows могут не работать — не страшно
    let (c, reset) = ("\x1b[", "\x1b[0m");
    if ms < 50.0 {
        format!("{}32m{}{}", c, s, reset)
    } else if ms < 200.0 {
        format!("{}33m{}{}", c, s, reset)
    } else {
        format!("{}31m{}{}", c, s, reset)
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("BRIX ping — диагностика задержки до сервера BRIX (v0.5.22)");
        eprintln!();
        eprintln!("Использование:");
        eprintln!("  brix-ping tcp  <host:port> [кол-во]      — чистый TCP connect");
        eprintln!("  brix-ping http <http://host:port/путь> [кол-во] — GET /ping или /status");
        eprintln!("  brix-ping ws   <ws://host:port> [кол-во] — WebSocket ping/pong (как в игре)");
        eprintln!();
        eprintln!("Примеры:");
        eprintln!("  brix-ping ws localhost:8787");
        eprintln!("  brix-ping tcp 192.168.1.5:8787 20");
        eprintln!("  brix-ping ws lpxm82mp-8787.euw.devtunnels.ms 20");
        std::process::exit(2);
    }

    let mode = args[1].to_lowercase();
    let target = match parse_target(&args[2]) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("Ошибка: {}", e);
            std::process::exit(2);
        }
    };
    let count: usize = args
        .get(3)
        .and_then(|s| s.parse().ok())
        .unwrap_or(10)
        .clamp(1, 200);

    let mode = match mode.as_str() {
        "tcp" => Scheme::Tcp,
        "http" => Scheme::Http,
        "ws" => Scheme::Ws,
        _ => {
            eprintln!("Неизвестный режим «{}» — используй tcp / http / ws", mode);
            std::process::exit(2);
        }
    };

    let label = format!(
        "{}:{}{} ({})",
        target.host,
        target.port,
        if target.path.is_empty() { "" } else { &target.path },
        match mode {
            Scheme::Tcp => "TCP connect",
            Scheme::Http => "HTTP GET",
            _ => "WebSocket ping",
        }
    );
    println!("BRIX-PING → {}", label);
    println!("серия из {} замеров, таймаут {} мс", count, TIMEOUT.as_millis());
    println!();

    let mut results: Vec<Option<f64>> = Vec::with_capacity(count);
    for i in 1..=count {
        let res = match mode {
            Scheme::Tcp => tcp_rtt(&target.host, target.port, TIMEOUT)
                .map(|d| d.as_secs_f64() * 1000.0)
                .map_err(|e| e.to_string()),
            Scheme::Http => http_rtt(&target, TIMEOUT).map(|d| d.as_secs_f64() * 1000.0),
            Scheme::Ws => ws_rtt(&target, TIMEOUT).map(|d| d.as_secs_f64() * 1000.0),
        };
        match res {
            Ok(ms) => {
                results.push(Some(ms));
                println!("  {:>3}: {} мс", i, colorize(ms, format!("{:.1}", ms)));
            }
            Err(e) => {
                results.push(None);
                println!("  {:>3}: ПОТЕРЯ ({})", i, e);
            }
        }
        if i < count {
            std::thread::sleep(Duration::from_millis(300));
        }
    }

    let st = stats(&results);
    println!();
    println!("───────────────────────────────────────────");
    if st.count == 0 {
        println!("  СЕРВЕР НЕ ОТВЕЧАЕТ ({}/{} потерь)", st.lost, st.total);
        std::process::exit(1);
    }
    println!(
        "  min {:.1}  avg {}  max {:.1}  джиттер {:.1}  (мс)",
        st.min,
        colorize(st.avg, format!("{:.1}", st.avg)),
        st.max,
        st.jitter
    );
    println!(
        "  потери: {}/{} ({:.0}%)",
        st.lost,
        st.total,
        st.loss
    );
    println!();
    // Подсказка — что означает такой пинг
    if st.avg < 50.0 {
        println!("  ОТЛИЧНО: задержка незаметна в игре.");
    } else if st.avg < 200.0 {
        println!("  НОРМАЛЬНО: стрелять комфортно, возможны мелкие рывки чужих игроков.");
    } else if st.avg < 500.0 {
        println!("  МЕДЛЕННО: заметно в бою. Если локальный пинг мал, а через туннел — большой,");
        println!("  задержку добавляет САМ ТУННЕЛ (Dev Tunnels гоняет трафик через Европу).");
    } else {
        println!("  ОЧЕНЬ МЕДЛЕННО: сравни tcp/http/ws на localhost и через туннел, чтобы понять,");
        println!("  где теряется время: канал (tcp) или обработка (ws/http).");
    }
}
