import Foundation
import Security

struct SavedSession: Codable, Sendable {
    let token: String
    let account: Account
}

