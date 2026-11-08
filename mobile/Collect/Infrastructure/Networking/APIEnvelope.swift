import Foundation

struct APIEnvelope<Value: Decodable & Sendable>: Decodable, Sendable {
    var success: Bool
    var data: Value?
    var error: String?
}
