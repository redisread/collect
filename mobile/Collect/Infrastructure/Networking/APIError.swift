import Foundation

struct APIError: Error, LocalizedError, Sendable {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

