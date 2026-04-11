class Article {
  final String id;
  final String feedId;
  final String title;
  final String url;
  final String? content;
  final String? summary;
  final String? author;
  final String? imageUrl;
  final String? publishedAt;
  final bool isRead;
  final bool isStarred;
  final bool isReadLater;
  final int? readingProgress; // 0-100 的阅读进度

  const Article({
    required this.id,
    required this.feedId,
    required this.title,
    required this.url,
    this.content,
    this.summary,
    this.author,
    this.imageUrl,
    this.publishedAt,
    this.isRead = false,
    this.isStarred = false,
    this.isReadLater = false,
    this.readingProgress,
  });

  factory Article.fromJson(Map<String, dynamic> json) => Article(
        id: json['id'] as String,
        feedId: json['feedId'] as String,
        title: json['title'] as String,
        url: json['url'] as String,
        content: json['content'] as String?,
        summary: json['summary'] as String?,
        author: json['author'] as String?,
        imageUrl: json['imageUrl'] as String?,
        publishedAt: json['publishedAt'] as String?,
        isRead: json['isRead'] as bool? ?? false,
        isStarred: json['isStarred'] as bool? ?? false,
        isReadLater: json['isReadLater'] as bool? ?? false,
        readingProgress: json['readingProgress'] as int?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'feedId': feedId,
        'title': title,
        'url': url,
        'content': content,
        'summary': summary,
        'author': author,
        'imageUrl': imageUrl,
        'publishedAt': publishedAt,
        'isRead': isRead,
        'isStarred': isStarred,
        'isReadLater': isReadLater,
        'readingProgress': readingProgress,
      };

  Article copyWith({
    bool? isRead,
    bool? isStarred,
    bool? isReadLater,
    int? readingProgress,
    String? content,
  }) =>
      Article(
        id: id,
        feedId: feedId,
        title: title,
        url: url,
        content: content ?? this.content,
        summary: summary,
        author: author,
        imageUrl: imageUrl,
        publishedAt: publishedAt,
        isRead: isRead ?? this.isRead,
        isStarred: isStarred ?? this.isStarred,
        isReadLater: isReadLater ?? this.isReadLater,
        readingProgress: readingProgress ?? this.readingProgress,
      );
}
