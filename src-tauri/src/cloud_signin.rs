//! Signing the Mac in to Voidcat Cloud through the browser. Sign-in pages don't work inside the app's window, so the
//! app listens on localhost for a few minutes: the sign-in email's link comes back to `/signin/<nonce>`, and
//! `/google/<nonce>` is a small page that signs in with Google and posts the result back. Either way the interface
//! gets an event and finishes signing in itself. The random nonce in every path keeps other pages and apps out.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// The Firebase web settings (not secret: they only name the project), for the Google page.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebConfig {
    api_key: String,
    auth_domain: String,
    project_id: String,
    app_id: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum SignedIn {
    /// The sign-in email's link, as it reached this Mac.
    Link { url: String },
    Google {
        #[serde(rename = "idToken")]
        id_token: String,
    },
}

#[derive(Serialize)]
pub struct Listening {
    port: u16,
    nonce: String,
}

/// Only the latest listener answers; starting another one ends the one before.
static GENERATION: AtomicU64 = AtomicU64::new(0);
const WAIT: Duration = Duration::from_secs(20 * 60);
pub const EVENT: &str = "cloud-sign-in";

pub fn listen(app: AppHandle, config: WebConfig) -> Result<Listening, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let (n, started) = (nonce.clone(), Instant::now());
    std::thread::spawn(move || {
        while GENERATION.load(Ordering::SeqCst) == generation && started.elapsed() < WAIT {
            match listener.accept() {
                Ok((stream, _)) => {
                    if let Some(done) = answer(stream, port, &n, &config) {
                        let _ = app.emit(EVENT, done);
                        return;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(150)),
                Err(_) => return,
            }
        }
    });
    Ok(Listening { port, nonce })
}

/// Stops waiting (the person cancelled).
pub fn stop() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
}

fn answer(mut stream: TcpStream, port: u16, nonce: &str, config: &WebConfig) -> Option<SignedIn> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let (method, path, body) = read_request(&mut stream)?;
    let signin = format!("/signin/{nonce}");
    let google = format!("/google/{nonce}");
    let (status, kind, page, done) = if method == "GET" && (path == signin || path.starts_with(&format!("{signin}?"))) {
        let url = format!("http://localhost:{port}{path}");
        ("200 OK", "text/html", page_done(), Some(SignedIn::Link { url }))
    } else if method == "GET" && path == google {
        ("200 OK", "text/html", page_google(config, &format!("{google}/token")), None)
    } else if method == "POST" && path == format!("{google}/token") && !body.trim().is_empty() && body.len() < 8192 {
        ("200 OK", "text/plain", "ok".to_string(), Some(SignedIn::Google { id_token: body.trim().to_string() }))
    } else {
        ("404 Not Found", "text/plain", "Not here.".to_string(), None)
    };
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {kind}; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{page}",
        page.len()
    );
    done
}

fn read_request(stream: &mut TcpStream) -> Option<(String, String, String)> {
    let mut data = Vec::new();
    let mut buf = [0u8; 4096];
    let head_end = loop {
        let n = stream.read(&mut buf).ok()?;
        if n == 0 {
            return None;
        }
        data.extend_from_slice(&buf[..n]);
        if let Some(i) = data.windows(4).position(|w| w == b"\r\n\r\n") {
            break i + 4;
        }
        if data.len() > 64 * 1024 {
            return None;
        }
    };
    let head = String::from_utf8_lossy(&data[..head_end]).to_string();
    let mut first = head.lines().next()?.split_whitespace();
    let (method, path) = (first.next()?.to_string(), first.next()?.to_string());
    let length: usize = head
        .lines()
        .find_map(|l| l.split_once(':').filter(|(k, _)| k.eq_ignore_ascii_case("content-length")).and_then(|(_, v)| v.trim().parse().ok()))
        .unwrap_or(0)
        .min(16 * 1024);
    while data.len() < head_end + length {
        let n = stream.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
    }
    let body = String::from_utf8_lossy(&data[head_end..(head_end + length).min(data.len())]).to_string();
    Some((method, path, body))
}

const STYLE: &str = "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f3f8;color:#0b0b0f;font:15px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:420px;padding:32px;text-align:center}h1{font-weight:300;font-size:28px;margin:0 0 8px}p{color:#5e5c6b;margin:0 0 20px}
button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:11px 20px;background:#18181b;color:#fff;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#0b0b0f;color:#f5f5f7}p{color:#a1a1aa}button{background:#f5f5f7;color:#0b0b0f}}";

fn page_done() -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Voidcat</title><style>{STYLE}</style></head>
<body><main><h1>You're signed in</h1><p>Go back to Voidcat on your Mac to finish. You can close this tab.</p></main></body></html>"
    )
}

fn page_google(config: &WebConfig, token_path: &str) -> String {
    // JSON inside a script: escape "<" so nothing in it can close the tag.
    let cfg = serde_json::to_string(config).unwrap_or_default().replace('<', "\\u003c");
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Voidcat</title><style>{STYLE}</style></head>
<body><main><h1>Connect your Mac</h1><p id=\"note\">Sign in with Google to connect Voidcat on this Mac to your cloud library.</p><button id=\"go\">Continue with Google</button></main>
<script type=\"module\">
import {{ initializeApp }} from \"https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js\";
import {{ getAuth, GoogleAuthProvider, signInWithPopup }} from \"https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js\";
const auth = getAuth(initializeApp({cfg}));
const note = document.getElementById(\"note\"), go = document.getElementById(\"go\");
go.onclick = async () => {{
  try {{
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const token = GoogleAuthProvider.credentialFromResult(result)?.idToken;
    if (!token) throw new Error(\"Google didn't give a sign-in token.\");
    await fetch(\"{token_path}\", {{ method: \"POST\", body: token }});
    go.remove();
    document.querySelector(\"h1\").textContent = \"You're signed in\";
    note.textContent = \"Go back to Voidcat on your Mac to finish. You can close this tab.\";
  }} catch (e) {{ note.textContent = \"Couldn't sign in: \" + (e.message || e); }}
}};
</script></body></html>"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> WebConfig {
        WebConfig { api_key: "k".into(), auth_domain: "example.firebaseapp.com".into(), project_id: "p</script>".into(), app_id: "a".into() }
    }

    fn ask(port: u16, request: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(request.as_bytes()).unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn answers_only_with_the_nonce_and_hands_back_the_link() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            let mut found = vec![];
            for _ in 0..4 {
                let (stream, _) = listener.accept().unwrap();
                found.push(answer(stream, port, "abc", &config()).map(|d| serde_json::to_string(&d).unwrap()));
            }
            found
        });
        assert!(ask(port, "GET /signin/wrong?oobCode=1 HTTP/1.1\r\n\r\n").starts_with("HTTP/1.1 404"));
        let google = ask(port, "GET /google/abc HTTP/1.1\r\n\r\n");
        assert!(google.contains("/google/abc/token") && !google.contains("p</script>"), "the config can't end the script");
        assert!(ask(port, "GET /signin/abc?mode=signIn&oobCode=x HTTP/1.1\r\n\r\n").contains("You're signed in"));
        assert!(ask(port, "POST /google/abc/token HTTP/1.1\r\nContent-Length: 5\r\n\r\ntoken").ends_with("ok"));
        let found = handle.join().unwrap();
        assert_eq!(found[0], None);
        assert_eq!(found[1], None);
        assert_eq!(found[2].as_deref(), Some(format!("{{\"kind\":\"link\",\"url\":\"http://localhost:{port}/signin/abc?mode=signIn&oobCode=x\"}}").as_str()));
        assert_eq!(found[3].as_deref(), Some("{\"kind\":\"google\",\"idToken\":\"token\"}"));
    }
}
