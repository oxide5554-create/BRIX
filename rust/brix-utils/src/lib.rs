// ============================================================
//  brix • rust/brix-utils/src/lib.rs
//  Общая сетевая начинка утилит: БЕЗ ВНЕШНИХ КРАТОВ — только std.
//  Работает на Windows/Linux/macOS, собирается за секунды.
//
//  Что здесь есть:
//   · parse_target — разбор цели (host:port | http:// | ws://)
//   · tcp_rtt      — чистый TCP connect (сколько идёт рукопожатие)
//   · http_rtt     — GET-запрос и чтение заголовков (полный HTTP RTT)
//   · ws_rtt       — WebSocket handshake + ping/pong (как пингует игра)
//   · stats        — min/avg/max/джиттер/потери по серии замеров
// ============================================================
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct Target {
    pub scheme: Scheme,
    pub host: String,
    pub port: u16,
    pub path: String,
    pub tls: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Scheme {
    Tcp,
    Http,
    Ws,
}

/// Разбор цели: "1.2.3.4:8787", "http://host:8787/status", "ws://host:8787".
pub fn parse_target(s: &str) -> Result<Target, String> {
    let s = s.trim();
    let (scheme, rest, tls, default_port) = if let Some(r) = s.strip_prefix("http://") {
        (Scheme::Http, r, false, 80u16)
    } else if let Some(r) = s.strip_prefix("https://") {
        (Scheme::Http, r, true, 443u16)
    } else if let Some(r) = s.strip_prefix("ws://") {
        (Scheme::Ws, r, false, 80u16)
    } else if let Some(r) = s.strip_prefix("wss://") {
        (Scheme::Ws, r, true, 443u16)
    } else {
        (Scheme::Tcp, s, false, 8787u16)
    };

    // путь: всё после первого /
    let (hostport, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };

    let (host, port) = match hostport.rsplit_once(':') {
        Some((h, p)) if !h.is_empty() => {
            let port: u16 = p.parse().map_err(|_| format!("плохой порт «{}»", p))?;
            (h.to_string(), port)
        }
        _ => (hostport.to_string(), default_port),
    };
    if host.is_empty() {
        return Err("пустой хост".into());
    }

    Ok(Target {
        scheme: scheme.clone(),
        host,
        port,
        path: if path.is_empty() && scheme == Scheme::Http {
            "/ping".into()
        } else {
            path.to_string()
        },
        tls,
    })
}

/// TCP connect RTT: открываем соединение и закрываем.
pub fn tcp_rtt(host: &str, port: u16, timeout: Duration) -> std::io::Result<Duration> {
    let started = Instant::now();
    let addr_iter = (host, port).to_socket_addrs()?;
    let mut last_err = None;
    for addr in addr_iter {
        match TcpStream::connect_timeout(&addr, timeout) {
            Ok(_) => return Ok(started.elapsed()),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "не удалось определить адрес")
    }))
}

/// Соединение с таймаутами на чтение/запись.
fn dial(host: &str, port: u16, timeout: Duration) -> std::io::Result<TcpStream> {
    let addr_iter = (host, port).to_socket_addrs()?;
    let mut last_err = None;
    let mut connected = None;
    for addr in addr_iter {
        match TcpStream::connect_timeout(&addr, timeout) {
            Ok(s) => {
                connected = Some(s);
                break;
            }
            Err(e) => last_err = Some(e),
        }
    }
    let s = connected.ok_or_else(|| {
        last_err.unwrap_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::Other, "не удалось определить адрес")
        })
    })?;
    let _ = s.set_read_timeout(Some(timeout));
    let _ = s.set_write_timeout(Some(timeout));
    Ok(s)
}

/// HTTP GET RTT: шлём запрос, читаем ЗАГОЛОВКИ (до \r\n\r\n), закрываем.
pub fn http_rtt(t: &Target, timeout: Duration) -> Result<Duration, String> {
    let started = Instant::now();
    let mut s = dial(&t.host, t.port, timeout).map_err(|e| e.to_string())?;
    let req = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: brix-ping\r\nConnection: close\r\n\r\n",
        t.path, t.host
    );
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 2048];
    let n = s.read(&mut buf).map_err(|e| e.to_string())?;
    let elapsed = started.elapsed();
    let head = String::from_utf8_lossy(&buf[..n]);
    if head.starts_with("HTTP/") {
        Ok(elapsed)
    } else {
        Err("ответ не похож на HTTP".into())
    }
}

/// WS handshake + ping frame RTT — так же, как меряет пинг сама игра.
pub fn ws_rtt(t: &Target, timeout: Duration) -> Result<Duration, String> {
    use rand_free::gen_key;
    let _started = Instant::now();
    let mut s = dial(&t.host, t.port, timeout).map_err(|e| e.to_string())?;
    let key = gen_key();
    let req = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
         Sec-WebSocket-Key: {}\r\nSec-WebSocket-Version: 13\r\n\r\n",
        if t.path.is_empty() { "/" } else { &t.path },
        t.host,
        key
    );
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;

    // читаем до конца заголовков
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match s.read(&mut byte) {
            Ok(0) => return Err("соединение закрыто во время handshake".into()),
            Ok(_) => {
                head.push(byte[0]);
                if head.ends_with(b"\r\n\r\n") {
                    break;
                }
                if head.len() > 16384 {
                    return Err("слишком большой заголовок".into());
                }
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    let head_str = String::from_utf8_lossy(&head);
    if !head_str.contains("101") {
        return Err(format!("handshake отклонён: {}", first_line(&head_str)));
    }

    /* --- кадры WS: чтение текстового кадра целиком --- */
    fn read_text_frame(s: &mut TcpStream) -> Result<String, String> {
        let mut hdr = [0u8; 2];
        s.read_exact(&mut hdr).map_err(|e| e.to_string())?;
        let _opcode = hdr[0] & 0x0F;
        let masked = hdr[1] & 0x80 != 0;
        let len = match (hdr[1] & 0x7F) as usize {
            126 => {
                let mut b2 = [0u8; 2];
                s.read_exact(&mut b2).map_err(|e| e.to_string())?;
                u16::from_be_bytes(b2) as usize
            }
            127 => {
                let mut b8 = [0u8; 8];
                s.read_exact(&mut b8).map_err(|e| e.to_string())?;
                u64::from_be_bytes(b8) as usize
            }
            n => n,
        };
        let mut mask = [0u8; 4];
        if masked {
            s.read_exact(&mut mask).map_err(|e| e.to_string())?;
        }
        let mut body = vec![0u8; len];
        if len > 0 {
            s.read_exact(&mut body).map_err(|e| e.to_string())?;
            if masked {
                for (i, b) in body.iter_mut().enumerate() {
                    *b ^= mask[i % 4];
                }
            }
        }
        Ok(String::from_utf8_lossy(&body).to_string())
    }

    /* --- кадры WS: отправка замаскированного текстового кадра --- */
    fn write_text_frame(s: &mut TcpStream, payload: &[u8]) -> Result<(), String> {
        let mut mask_key = [0u8; 4];
        rand_free::fill(&mut mask_key);
        let mut frame = vec![0x81u8]; // FIN + TEXT
        let len = payload.len();
        if len < 126 {
            frame.push(0x80u8 | len as u8);
        } else if len < 65536 {
            frame.push(0x80u8 | 126);
            frame.extend_from_slice(&(len as u16).to_be_bytes());
        } else {
            frame.push(0x80u8 | 127);
            frame.extend_from_slice(&(len as u64).to_be_bytes());
        }
        frame.extend_from_slice(&mask_key);
        for (i, b) in payload.iter().enumerate() {
            frame.push(b ^ mask_key[i % 4]);
        }
        s.write_all(&frame).map_err(|e| e.to_string())
    }

    // ✅ v0.5.22: сервер отвечает pong'ом только ЗАРЕГИСТРИРОВАННЫМ
    // соединениям (перед первым ping нужен hello). RTT меряем ЧИСТО:
    // от отправки {"t":"ping"} до ответа {"t":"pong"} — как в игре.
    write_text_frame(&mut s, b"{\"t\":\"hello\",\"n\":\"brix-ping\"}")?;
    let mut welcomed = false;
    for _ in 0..60 {
        let body = read_text_frame(&mut s)?;
        if body.contains("welcome") {
            welcomed = true;
            break;
        }
    }
    if !welcomed {
        return Err("сервер не прислал welcome".into());
    }

    write_text_frame(&mut s, b"{\"t\":\"ping\"}")?;
    let ping_started = Instant::now();
    let mut tries = 0;
    loop {
        let body = read_text_frame(&mut s)?;
        if body.contains("pong") {
            break;
        }
        tries += 1;
        if tries > 30 {
            return Err("pong не дождался".into());
        }
    }
    Ok(ping_started.elapsed())
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("").to_string()
}

/// Мини-модуль «случайности» без внешних кратов: хэш-ПСЧ от времени.
pub mod rand_free {
    use std::time::{SystemTime, UNIX_EPOCH};

    fn seed() -> u64 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E3779B97F4A7C15);
        // splitmix64
        let mut z = now.wrapping_add(0x9E3779B97F4A7C15);
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }

    pub fn gen_key() -> String {
        const B64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut z = seed();
        let mut out = String::with_capacity(24);
        for _ in 0..24 {
            z = z
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let idx = ((z >> 33) as usize) % 64;
            out.push(B64[idx] as char);
        }
        out
    }

    pub fn fill(buf: &mut [u8]) {
        let mut z = seed();
        for b in buf.iter_mut() {
            z = z
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            *b = (z >> 33) as u8;
        }
    }
}

/// Статистика серии замеров (мс): min / avg / max / джиттер / потери.
#[derive(Debug, Clone)]
pub struct Stats {
    pub min: f64,
    pub avg: f64,
    pub max: f64,
    pub jitter: f64,
    pub loss: f64,   // 0..100 (%)
    pub lost: usize,
    pub count: usize, // успешных
    pub total: usize, // всего попыток
}

pub fn stats(results: &[Option<f64>]) -> Stats {
    let total = results.len();
    let ok: Vec<f64> = results.iter().filter_map(|r| *r).collect();
    let lost = total - ok.len();
    if ok.is_empty() {
        return Stats {
            min: 0.0,
            avg: 0.0,
            max: 0.0,
            jitter: 0.0,
            loss: 100.0,
            lost,
            count: 0,
            total,
        };
    }
    let min = ok.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = ok.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let avg = ok.iter().sum::<f64>() / ok.len() as f64;
    // джиттер = средний |разница| между соседними успешными замерами
    let jitter = if ok.len() > 1 {
        let sum: f64 = ok.windows(2).map(|w| (w[1] - w[0]).abs()).sum();
        sum / (ok.len() - 1) as f64
    } else {
        0.0
    };
    Stats {
        min,
        avg,
        max,
        jitter,
        loss: if total > 0 { lost as f64 * 100.0 / total as f64 } else { 100.0 },
        lost,
        count: ok.len(),
        total,
    }
}
