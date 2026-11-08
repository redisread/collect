import SwiftUI
import UniformTypeIdentifiers

struct ImportJob: Decodable, Sendable {
  let id: String
  let status: String
  let total: Int
  let imported: Int
  let failed: Int
  let skipped: Int
}
