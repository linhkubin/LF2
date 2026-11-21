"""May chu tinh cho ban web, tat cache de trinh duyet luon nap code moi nhat.

Dung: python tools/serve.py [cong]   (mac dinh 8765) roi mo http://localhost:8765
"""
import functools
import http.server
import os
import socket
import sys
import threading

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
                      ".wav": "audio/wav", ".ogg": "audio/ogg"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


class V6Server(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCacheHandler, directory=os.path.abspath(ROOT))
    # Chi nghe tren may nay, ca IPv4 (127.0.0.1) va IPv6 (::1): Chrome co the thu "localhost" qua ::1 truoc
    servers = [http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)]
    try:
        servers.append(V6Server(("::1", port), handler))
    except OSError as e:
        print(f"(khong mo duoc IPv6 ::1: {e})")
    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    print(f"LF2 web: http://localhost:{port}  hoac  http://127.0.0.1:{port}  (Ctrl+C de dung)")
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
