import Foundation

enum ReaderDocument {
  static func escape(_ value: String) -> String {
    value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
  }
  static func html(title: String, content: String, fontSize: Double) -> String {
    """
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'">
    <style>:root{color-scheme:dark}body{margin:24px;background:#000;color:#ddd;font: \(fontSize)px/1.7 -apple-system,system-ui;overflow-wrap:anywhere}h1{font-size:1.65em;line-height:1.3;color:#fff}a{color:#ffb56b}img{max-width:100%;height:auto}pre{overflow:auto;background:#161616;padding:14px;border-radius:8px}code{font-family:ui-monospace,monospace}blockquote{border-left:3px solid #555;margin-left:0;padding-left:16px;color:#aaa}table{display:block;overflow:auto}td,th{padding:8px;border-bottom:1px solid #444}figcaption{font-size:.8em;color:#999}.translation{color:#bbb}body{padding-bottom:50px}</style></head>
    <body><h1>\(escape(title))</h1>\(content)</body></html>
    """
  }
}
