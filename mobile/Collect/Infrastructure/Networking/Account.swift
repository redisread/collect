import Foundation

struct Account: Codable, Sendable, Equatable {
  let id: String
  let name: String
  let email: String
  var image: String? = nil
}
