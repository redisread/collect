import Foundation

struct AuthenticationResponse: Decodable, Sendable {
    let token: String
    let user: Account
}
