import Foundation
import Security

enum SessionVault {
  private static let service = "Collect.NativeSession"
  static func read() throws -> SavedSession? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecReturnData as String: true,
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw CocoaError(.fileReadNoPermission)
    }
    return try JSONDecoder().decode(SavedSession.self, from: data)
  }
  static func save(_ session: SavedSession) throws {
    let data = try JSONEncoder().encode(session)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
    ]
    let status = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
    if status == errSecItemNotFound {
      var item = query
      item[kSecValueData as String] = data
      item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
        throw CocoaError(.fileWriteNoPermission)
      }
    } else if status != errSecSuccess {
      throw CocoaError(.fileWriteNoPermission)
    }
  }
  static func clear() throws {
    let status = SecItemDelete(
      [kSecClass: kSecClassGenericPassword, kSecAttrService: service] as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw CocoaError(.fileWriteNoPermission)
    }
  }
}
