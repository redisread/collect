import 'package:flutter_test/flutter_test.dart';
import 'package:collect/models/folder.dart';

void main() {
  group('Folder Model', () {
    test('should create Folder from JSON', () {
      final json = {
        'id': 'folder-1',
        'userId': 'user-1',
        'name': 'Technology',
        'color': '#FF0000',
        'icon': 'folder-icon',
        'sortOrder': 1,
        'isCollapsed': true,
      };

      final folder = Folder.fromJson(json);

      expect(folder.id, 'folder-1');
      expect(folder.userId, 'user-1');
      expect(folder.name, 'Technology');
      expect(folder.color, '#FF0000');
      expect(folder.icon, 'folder-icon');
      expect(folder.sortOrder, 1);
      expect(folder.isCollapsed, true);
    });

    test('should handle optional fields with defaults', () {
      final json = {
        'id': 'folder-1',
        'userId': 'user-1',
        'name': 'Technology',
      };

      final folder = Folder.fromJson(json);

      expect(folder.color, null);
      expect(folder.icon, null);
      expect(folder.sortOrder, 0);
      expect(folder.isCollapsed, false);
    });

    test('should create Folder with const constructor', () {
      const folder = Folder(
        id: 'folder-1',
        userId: 'user-1',
        name: 'Technology',
      );

      expect(folder.id, 'folder-1');
      expect(folder.sortOrder, 0);
      expect(folder.isCollapsed, false);
    });

    test('should create Folder with custom values', () {
      const folder = Folder(
        id: 'folder-1',
        userId: 'user-1',
        name: 'Technology',
        color: '#00FF00',
        icon: 'tech-icon',
        sortOrder: 5,
        isCollapsed: true,
      );

      expect(folder.color, '#00FF00');
      expect(folder.icon, 'tech-icon');
      expect(folder.sortOrder, 5);
      expect(folder.isCollapsed, true);
    });
  });
}
