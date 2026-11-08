import Foundation

actor APIClient {
  let baseURL: URL
  private let transport: any HTTPTransport
  init(baseURL: URL, transport: any HTTPTransport = URLSessionTransport()) {
    self.baseURL = baseURL
    self.transport = transport
  }

  func raw(
    _ path: String, method: String = "GET", token: String? = nil, body: Data? = nil,
    contentType: String = "application/json"
  ) async throws -> (Data, Int) {
    guard let url = URL(string: path, relativeTo: baseURL), url.host == baseURL.host else {
      throw APIError(status: 0, message: "无效的服务地址")
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = body
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")
    request.setValue(baseURL.absoluteString, forHTTPHeaderField: "Origin")
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    return try await transport.send(request)
  }

  func request<Value: Decodable & Sendable>(
    _ path: String, method: String = "GET", token: String, body: Data? = nil,
    as type: Value.Type = Value.self
  ) async throws -> Value {
    let (data, status) = try await raw(path, method: method, token: token, body: body)
    let envelope = try JSONDecoder().decode(APIEnvelope<Value>.self, from: data)
    guard (200..<300).contains(status), envelope.success, let value = envelope.data else {
      throw APIError(status: status, message: envelope.error ?? "请求失败")
    }
    return value
  }

  func authenticate(email: String, password: String, name: String?) async throws
    -> AuthenticationResponse
  {
    var fields = ["email": email, "password": password]
    if let name { fields["name"] = name }
    let path = name == nil ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email"
    let (data, status) = try await raw(path, method: "POST", body: JSONEncoder().encode(fields))
    guard (200..<300).contains(status) else {
      throw APIError(status: status, message: "登录或注册失败，请检查输入后重试")
    }
    return try JSONDecoder().decode(AuthenticationResponse.self, from: data)
  }
}
