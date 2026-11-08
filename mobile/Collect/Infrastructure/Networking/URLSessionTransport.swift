import Foundation

actor URLSessionTransport: HTTPTransport {
    private let session: URLSession
    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.timeoutIntervalForRequest = 60
        session = URLSession(configuration: configuration)
    }
    func send(_ request: URLRequest) async throws -> (Data, Int) {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw APIError(status: 0, message: "无效的服务器响应") }
        return (data, response.statusCode)
    }
}
