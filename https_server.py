#!/usr/bin/env python3
"""Serve this package over local HTTPS for WebXR secure-context testing."""

from __future__ import annotations

import argparse
import functools
import ipaddress
import socket
import shutil
import ssl
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_CERT_DIR = PROJECT_ROOT / ".certs"
DEFAULT_CERT = DEFAULT_CERT_DIR / "localhost.pem"
DEFAULT_KEY = DEFAULT_CERT_DIR / "localhost-key.pem"


class QuietStaticHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".wasm": "application/wasm",
    }

    def end_headers(self) -> None:
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Serve the package root over HTTPS for WebXR prototypes.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind host. Default: 127.0.0.1")
    parser.add_argument("--port", type=int, default=8443, help="Bind port. Default: 8443")
    parser.add_argument("--root", type=Path, default=PROJECT_ROOT, help="Static root. Default: package root")
    parser.add_argument("--cert", type=Path, default=DEFAULT_CERT, help="TLS certificate path")
    parser.add_argument("--key", type=Path, default=DEFAULT_KEY, help="TLS private key path")
    parser.add_argument(
        "--lan",
        action="store_true",
        help="Bind to 0.0.0.0 and advertise this computer's LAN IP for headset access.",
    )
    parser.add_argument(
        "--public-host",
        action="append",
        default=[],
        help="Reachable host/IP to include in the certificate and printed URLs. Can be repeated.",
    )
    return parser.parse_args()


def detect_lan_ip() -> str | None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
        except OSError:
            return None


def normalized_hosts(bind_host: str, public_hosts: list[str]) -> list[str]:
    hosts = ["localhost", "127.0.0.1", *public_hosts]
    if bind_host not in {"0.0.0.0", "::", ""}:
        hosts.append(bind_host)
    seen: set[str] = set()
    result = []
    for host in hosts:
        host = host.strip()
        if host and host not in seen:
            seen.add(host)
            result.append(host)
    return result


def cert_alt_names(hosts: list[str]) -> str:
    names = []
    seen: set[str] = set()
    for host in hosts:
        try:
            ipaddress.ip_address(host)
        except ValueError:
            entry = f"DNS:{host}"
        else:
            entry = f"IP:{host}"
        if entry not in seen:
            seen.add(entry)
            names.append(entry)
    return ",".join(names)


def cert_matches_hosts(cert: Path, hosts: list[str]) -> bool:
    if not cert.exists():
        return False
    openssl = shutil.which("openssl")
    if not openssl:
        return False
    result = subprocess.run(
        [openssl, "x509", "-in", str(cert), "-noout", "-ext", "subjectAltName"],
        check=False,
        capture_output=True,
        text=True,
    )
    output = result.stdout + result.stderr
    if result.returncode != 0:
        return False
    for host in hosts:
        try:
            ipaddress.ip_address(host)
        except ValueError:
            if f"DNS:{host}" not in output:
                return False
        else:
            if f"IP Address:{host}" not in output and f"IP:{host}" not in output:
                return False
    return True


def _generate_with_cryptography(cert: Path, key: Path, hosts: list[str]) -> bool:
    """Generate a self-signed cert using the `cryptography` package. Returns True on success.

    Preferred on Windows where openssl is usually not on PATH. `pip install cryptography`.
    """
    try:
        import datetime
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        return False

    san = []
    for host in hosts:
        try:
            san.append(x509.IPAddress(ipaddress.ip_address(host)))
        except ValueError:
            san.append(x509.DNSName(host))

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.datetime.now(datetime.timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .sign(private_key, hashes.SHA256())
    )
    cert.parent.mkdir(parents=True, exist_ok=True)
    key.parent.mkdir(parents=True, exist_ok=True)
    key.write_bytes(
        private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )
    cert.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    return True


def ensure_cert(cert: Path, key: Path, hosts: list[str]) -> None:
    if cert.exists() and key.exists() and cert_matches_hosts(cert, hosts):
        return

    # Prefer the cryptography package (works cross-platform, no openssl on PATH needed).
    if _generate_with_cryptography(cert, key, hosts):
        print(f"Generated local self-signed certificate (cryptography): {cert}", flush=True)
        print(f"Generated local private key: {key}", flush=True)
        return

    openssl = shutil.which("openssl")
    if not openssl:
        raise SystemExit(
            "Could not generate a local self-signed certificate.\n"
            "Install one of:\n"
            "  - Python package:  pip install cryptography   (recommended on Windows)\n"
            "  - or openssl on PATH\n"
            "Or pass --cert and --key for an existing certificate."
        )

    cert.parent.mkdir(parents=True, exist_ok=True)
    key.parent.mkdir(parents=True, exist_ok=True)
    command = [
        openssl,
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-days",
        "3650",
        "-nodes",
        "-keyout",
        str(key),
        "-out",
        str(cert),
        "-subj",
        "/CN=localhost",
        "-addext",
        f"subjectAltName={cert_alt_names(hosts)}",
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"Generated local self-signed certificate: {cert}", flush=True)
    print(f"Generated local private key: {key}", flush=True)


def discover_webxr_paths(root: Path) -> list[str]:
    paths = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        app_index = child / "webxr-adaptation" / "index.html"
        if app_index.exists():
            paths.append(f"{child.name}/webxr-adaptation")
    return paths


def main() -> int:
    args = parse_args()
    public_hosts = list(args.public_host)
    bind_host = args.host
    if args.lan:
        bind_host = "0.0.0.0"
        lan_ip = detect_lan_ip()
        if lan_ip:
            public_hosts.append(lan_ip)

    root = args.root.resolve()
    cert = args.cert.resolve()
    key = args.key.resolve()
    cert_hosts = normalized_hosts(bind_host, public_hosts)
    display_hosts = normalized_hosts("127.0.0.1", public_hosts)

    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Static root does not exist or is not a directory: {root}")

    ensure_cert(cert, key, cert_hosts)

    handler = functools.partial(QuietStaticHandler, directory=str(root))
    httpd = ReusableThreadingHTTPServer((bind_host, args.port), handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(cert), keyfile=str(key))
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    base_url = f"https://{display_hosts[0]}:{args.port}"
    webxr_paths = discover_webxr_paths(root)
    print(f"Serving {root}", flush=True)
    print(f"Bind address: {bind_host}:{args.port}", flush=True)
    print(f"Root URL: {base_url}/", flush=True)
    for webxr_path in webxr_paths:
        print(f"WebXR URL: {base_url}/{webxr_path}/", flush=True)
    for host in display_hosts[1:]:
        for webxr_path in webxr_paths:
            print(f"Also available: https://{host}:{args.port}/{webxr_path}/", flush=True)
    print("The browser may show a certificate warning because this is a local self-signed certificate.", flush=True)
    print("Press Ctrl+C to stop.", flush=True)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping HTTPS server.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
