// ============================================================
//  brix • rust/brix-utils/src/bin/brix-info.rs
//  СВОДКА ПО ВСЕМ СЕРВЕРАМ BRIX одним взглядом (v0.5.22).
//  Опрашивает /status каждого порта и печатает таблицу:
//  имя, реалм, онлайн, версию, сид и ОТСЧЁТ ДО ВАЙПА.
//
//  ПРИМЕРЫ:
//    brix-info                          — localhost: 8780/8787/8788/8789
//    brix-info 192.168.1.5              — свой хост
//    brix-info lpxm82mp-8780.euw.devtunnels.ms — хост меню через Dev Tunnels
//      (для туннельного хоста порты подставляются в поддомен автоматически:
//       <id>-8787..., <id>-8788..., <id>-8789...)
// ============================================================
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

const PORTS: [u16; 4] = [8780, 8787, 8788, 8789];
const TIMEOUT: Duration = Duration::from_millis(2500);

/// Минимальный GET по HTTP (без TLS: devtunnels-адреса без схемы — локальные).
fn http_get(host: &str, port: u16, path: &str) -> Result<String, String> {
    let addr_iter = (host, port)
        .to_socket_addrs()
        .map_err(|e| e.to_string())?;
    let mut stream = None;
    for addr in addr_iter {
        if let Ok(s) = TcpStream::connect_timeout(&addr, TIMEOUT) {
            stream = Some(s);
            break;
        }
    }
    let mut s = stream.ok_or("сервер не отвечает")?;
    let _ = s.set_read_timeout(Some(TIMEOUT));
    let req = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: brix-info\r\nConnection: close\r\n\r\n",
        path, host
    );
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    let _ = s.read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf).to_string();
    // тело после \r\n\r\n
    match text.find("\r\n\r\n") {
        Some(i) => Ok(text[i + 4..].to_string()),
        None => Err("пустой ответ".into()),
    }
}

/// Достаём строковое поле из JSON без serde (значения BRIX простые).
fn jstr<'a>(json: &'a str, key: &str) -> Option<&'a str> {
    let pat = format!("\"{}\":", key);
    let i = json.find(&pat)? + pat.len();
    let rest = &json[i..];
    let rest = rest.trim_start();
    if let Some(stripped) = rest.strip_prefix('"') {
        let end = stripped.find('"')?;
        Some(&stripped[..end])
    } else {
        let end = rest
            .find(|c: char| c == ',' || c == '}')
            .unwrap_or(rest.len());
        Some(rest[..end].trim())
    }
}

fn jnum(json: &str, key: &str) -> Option<u64> {
    jstr(json, key)?.parse().ok()
}

/// Хост с подстановкой порта в поддомен (Dev Tunnels: id-8787.region...).
fn host_for_port(base_host: &str, port: u16) -> (String, bool) {
    // есть ли порт в поддомене уже?
    let tunnel_re = |h: &str| -> Option<(String, String)> {
        // <id>-<порт>.<остальное>
        let dot = h.find('.')?;
        let first = &h[..dot];
        let dash = first.rfind('-')?;
        let p = &first[dash + 1..];
        if p.chars().all(|c| c.is_ascii_digit()) && p.len() >= 2 {
            Some((first[..dash].to_string(), h[dot..].to_string()))
        } else {
            None
        }
    };
    if let Some((id, tail)) = tunnel_re(base_host) {
        return (format!("{}-{}{}", id, port, tail), false);
    }
    (base_host.to_string(), false)
}

fn fmt_wipe(ms: u64) -> String {
    let total_min = ms / 60000;
    let h = total_min / 60;
    let m = total_min % 60;
    if h > 0 {
        format!("{} ч {} мин", h, m)
    } else {
        format!("{} мин", m)
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let base = args
        .get(1)
        .cloned()
        .unwrap_or_else(|| "localhost".to_string());

    println!("BRIX INFO — сводка серверов (хост: {})", base);
    println!();
    println!(
        "{:<22} {:<10} {:<12} {:<10} {:<8} {}",
        "СЕРВЕР", "РЕАЛМ", "ОНЛАЙН", "ВЕРСИЯ", "СИД", "ВАЙП"
    );
    println!("{}", "─".repeat(88));

    for port in PORTS {
        let (host, _tls) = host_for_port(&base, port);
        match http_get(&host, port, "/status") {
            Ok(body) => {
                let name = jstr(&body, "name").unwrap_or("?").to_string();
                let realm = jstr(&body, "realm").unwrap_or("?").to_string();
                let players = jnum(&body, "players").unwrap_or(0);
                let max = jnum(&body, "max").unwrap_or(0);
                let ver = jstr(&body, "ver").unwrap_or("старый").to_string();
                let seed = jnum(&body, "seed").unwrap_or(0);
                let wipe_in = jnum(&body, "wipeIn").unwrap_or(0);
                let menu = jstr(&body, "menu").unwrap_or("0") != "0";
                let kind = if menu {
                    "меню".to_string()
                } else if realm == "brixwipe" {
                    format!("вайп через {}", fmt_wipe(wipe_in))
                } else if realm == "brixpvp" {
                    "арена".to_string()
                } else {
                    "выживание".to_string()
                };
                println!(
                    "{:<22} {:<10} {:<12} {:<10} {:<8} {}",
                    name,
                    realm,
                    format!("{}/{}", players, max),
                    ver,
                    if seed > 0 { seed.to_string() } else { "—".into() },
                    kind
                );
            }
            Err(_) => {
                println!(
                    "{:<22} {:<10} {:<12} {:<10} {:<8} {}",
                    format!(":{}", port),
                    "—",
                    "не отвечает",
                    "—",
                    "—",
                    "—"
                );
            }
        }
    }
    println!();
    println!("Подсказка: brix-info <host> — например 192.168.1.5 или адрес Dev Tunnels.");
}
