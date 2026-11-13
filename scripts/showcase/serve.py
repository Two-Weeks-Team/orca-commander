"""Serve generated documentation previews on localhost without per-asset logs."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--directory", required=True)
parser.add_argument("--port", type=int, default=53719)
args = parser.parse_args()
directory = Path(args.directory).resolve()
if not (directory / "index.html").is_file():
    parser.error("Generate the preview first")

class PreviewHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

class PreviewServer(ThreadingHTTPServer):
    # A controller contains many independent PNGs. The stdlib backlog of five
    # resets bursts of parallel asset connections on some development hosts.
    request_queue_size = 128
    daemon_threads = True

server = PreviewServer(("127.0.0.1", args.port), partial(PreviewHandler, directory=str(directory)))
print("Preview: http://127.0.0.1:" + str(args.port) + "/", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
