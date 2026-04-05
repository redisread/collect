import { z } from "zod";
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    emailVerified: z.ZodBoolean;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
    updatedAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
    image?: string | null | undefined;
}, {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
    image?: string | null | undefined;
}>;
export type User = z.infer<typeof UserSchema>;
export declare const FolderSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    name: z.ZodString;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    isCollapsed: z.ZodOptional<z.ZodBoolean>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    userId: string;
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | undefined;
    isCollapsed?: boolean | undefined;
}, {
    id: string;
    name: string;
    userId: string;
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | undefined;
    isCollapsed?: boolean | undefined;
}>;
export type Folder = z.infer<typeof FolderSchema>;
export declare const CreateFolderSchema: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    color?: string | undefined;
    icon?: string | undefined;
}, {
    name: string;
    color?: string | undefined;
    icon?: string | undefined;
}>;
export type CreateFolderInput = z.infer<typeof CreateFolderSchema>;
export declare const UpdateFolderSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    isCollapsed: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    color?: string | undefined;
    icon?: string | undefined;
    sortOrder?: number | undefined;
    isCollapsed?: boolean | undefined;
}, {
    name?: string | undefined;
    color?: string | undefined;
    icon?: string | undefined;
    sortOrder?: number | undefined;
    isCollapsed?: boolean | undefined;
}>;
export type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>;
export declare const FeedSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    folderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    title: z.ZodString;
    url: z.ZodString;
    feedUrl: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    faviconUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastFetchedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    id: string;
    userId: string;
    url: string;
    feedUrl: string;
    description?: string | null | undefined;
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    sortOrder?: number | undefined;
    folderId?: string | null | undefined;
    faviconUrl?: string | null | undefined;
    lastFetchedAt?: string | null | undefined;
}, {
    title: string;
    id: string;
    userId: string;
    url: string;
    feedUrl: string;
    description?: string | null | undefined;
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    sortOrder?: number | undefined;
    folderId?: string | null | undefined;
    faviconUrl?: string | null | undefined;
    lastFetchedAt?: string | null | undefined;
}>;
export type Feed = z.infer<typeof FeedSchema>;
export declare const FeedWithUnreadCountSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    folderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    title: z.ZodString;
    url: z.ZodString;
    feedUrl: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    faviconUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastFetchedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    unreadCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    title: string;
    id: string;
    userId: string;
    url: string;
    feedUrl: string;
    unreadCount: number;
    description?: string | null | undefined;
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    sortOrder?: number | undefined;
    folderId?: string | null | undefined;
    faviconUrl?: string | null | undefined;
    lastFetchedAt?: string | null | undefined;
}, {
    title: string;
    id: string;
    userId: string;
    url: string;
    feedUrl: string;
    unreadCount: number;
    description?: string | null | undefined;
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    sortOrder?: number | undefined;
    folderId?: string | null | undefined;
    faviconUrl?: string | null | undefined;
    lastFetchedAt?: string | null | undefined;
}>;
export type FeedWithUnreadCount = z.infer<typeof FeedWithUnreadCountSchema>;
export declare const CreateFeedSchema: z.ZodObject<{
    url: z.ZodString;
    folderId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    url: string;
    folderId?: string | undefined;
}, {
    url: string;
    folderId?: string | undefined;
}>;
export type CreateFeedInput = z.infer<typeof CreateFeedSchema>;
export declare const UpdateFeedSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    folderId: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    sortOrder?: number | undefined;
    folderId?: string | undefined;
}, {
    title?: string | undefined;
    sortOrder?: number | undefined;
    folderId?: string | undefined;
}>;
export type UpdateFeedInput = z.infer<typeof UpdateFeedSchema>;
export declare const ArticleSchema: z.ZodObject<{
    id: z.ZodString;
    feedId: z.ZodString;
    title: z.ZodString;
    url: z.ZodString;
    content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    summary: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    author: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    imageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    publishedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isRead: z.ZodOptional<z.ZodBoolean>;
    isStarred: z.ZodOptional<z.ZodBoolean>;
    isReadLater: z.ZodOptional<z.ZodBoolean>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    id: string;
    url: string;
    feedId: string;
    createdAt?: string | null | undefined;
    content?: string | null | undefined;
    summary?: string | null | undefined;
    author?: string | null | undefined;
    imageUrl?: string | null | undefined;
    publishedAt?: string | null | undefined;
    isRead?: boolean | undefined;
    isStarred?: boolean | undefined;
    isReadLater?: boolean | undefined;
}, {
    title: string;
    id: string;
    url: string;
    feedId: string;
    createdAt?: string | null | undefined;
    content?: string | null | undefined;
    summary?: string | null | undefined;
    author?: string | null | undefined;
    imageUrl?: string | null | undefined;
    publishedAt?: string | null | undefined;
    isRead?: boolean | undefined;
    isStarred?: boolean | undefined;
    isReadLater?: boolean | undefined;
}>;
export type Article = z.infer<typeof ArticleSchema>;
export declare const ArticleWithFeedSchema: z.ZodObject<{
    id: z.ZodString;
    feedId: z.ZodString;
    title: z.ZodString;
    url: z.ZodString;
    content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    summary: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    author: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    imageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    publishedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isRead: z.ZodOptional<z.ZodBoolean>;
    isStarred: z.ZodOptional<z.ZodBoolean>;
    isReadLater: z.ZodOptional<z.ZodBoolean>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    feed: z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        folderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        title: z.ZodString;
        url: z.ZodString;
        feedUrl: z.ZodString;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        faviconUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        lastFetchedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        sortOrder: z.ZodOptional<z.ZodNumber>;
        createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        id: string;
        userId: string;
        url: string;
        feedUrl: string;
        description?: string | null | undefined;
        createdAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        sortOrder?: number | undefined;
        folderId?: string | null | undefined;
        faviconUrl?: string | null | undefined;
        lastFetchedAt?: string | null | undefined;
    }, {
        title: string;
        id: string;
        userId: string;
        url: string;
        feedUrl: string;
        description?: string | null | undefined;
        createdAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        sortOrder?: number | undefined;
        folderId?: string | null | undefined;
        faviconUrl?: string | null | undefined;
        lastFetchedAt?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    title: string;
    id: string;
    url: string;
    feedId: string;
    feed: {
        title: string;
        id: string;
        userId: string;
        url: string;
        feedUrl: string;
        description?: string | null | undefined;
        createdAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        sortOrder?: number | undefined;
        folderId?: string | null | undefined;
        faviconUrl?: string | null | undefined;
        lastFetchedAt?: string | null | undefined;
    };
    createdAt?: string | null | undefined;
    content?: string | null | undefined;
    summary?: string | null | undefined;
    author?: string | null | undefined;
    imageUrl?: string | null | undefined;
    publishedAt?: string | null | undefined;
    isRead?: boolean | undefined;
    isStarred?: boolean | undefined;
    isReadLater?: boolean | undefined;
}, {
    title: string;
    id: string;
    url: string;
    feedId: string;
    feed: {
        title: string;
        id: string;
        userId: string;
        url: string;
        feedUrl: string;
        description?: string | null | undefined;
        createdAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        sortOrder?: number | undefined;
        folderId?: string | null | undefined;
        faviconUrl?: string | null | undefined;
        lastFetchedAt?: string | null | undefined;
    };
    createdAt?: string | null | undefined;
    content?: string | null | undefined;
    summary?: string | null | undefined;
    author?: string | null | undefined;
    imageUrl?: string | null | undefined;
    publishedAt?: string | null | undefined;
    isRead?: boolean | undefined;
    isStarred?: boolean | undefined;
    isReadLater?: boolean | undefined;
}>;
export type ArticleWithFeed = z.infer<typeof ArticleWithFeedSchema>;
export declare const UpdateArticleSchema: z.ZodObject<{
    isRead: z.ZodOptional<z.ZodBoolean>;
    isStarred: z.ZodOptional<z.ZodBoolean>;
    isReadLater: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    isRead?: boolean | undefined;
    isStarred?: boolean | undefined;
    isReadLater?: boolean | undefined;
}, {
    isRead?: boolean | undefined;
    isStarred?: boolean | undefined;
    isReadLater?: boolean | undefined;
}>;
export type UpdateArticleInput = z.infer<typeof UpdateArticleSchema>;
export declare const ApiResponseSchema: <T extends z.ZodTypeAny>(dataSchema: T) => z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<T>;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    success: z.ZodBoolean;
    data: z.ZodOptional<T>;
    error: z.ZodOptional<z.ZodString>;
}>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<{
    success: z.ZodBoolean;
    data: z.ZodOptional<T>;
    error: z.ZodOptional<z.ZodString>;
}> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>;
export type ApiResponse<T> = {
    success: boolean;
    data?: T;
    error?: string;
};
export declare const FolderWithFeedsSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    name: z.ZodString;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    isCollapsed: z.ZodOptional<z.ZodBoolean>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    feeds: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        folderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        title: z.ZodString;
        url: z.ZodString;
        feedUrl: z.ZodString;
        description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        faviconUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        lastFetchedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        sortOrder: z.ZodOptional<z.ZodNumber>;
        createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    } & {
        unreadCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        title: string;
        id: string;
        userId: string;
        url: string;
        feedUrl: string;
        unreadCount: number;
        description?: string | null | undefined;
        createdAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        sortOrder?: number | undefined;
        folderId?: string | null | undefined;
        faviconUrl?: string | null | undefined;
        lastFetchedAt?: string | null | undefined;
    }, {
        title: string;
        id: string;
        userId: string;
        url: string;
        feedUrl: string;
        unreadCount: number;
        description?: string | null | undefined;
        createdAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        sortOrder?: number | undefined;
        folderId?: string | null | undefined;
        faviconUrl?: string | null | undefined;
        lastFetchedAt?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    userId: string;
    feeds: {
        title: string;
        id: string;
        userId: string;
        url: string;
        feedUrl: string;
        unreadCount: number;
        description?: string | null | undefined;
        createdAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        sortOrder?: number | undefined;
        folderId?: string | null | undefined;
        faviconUrl?: string | null | undefined;
        lastFetchedAt?: string | null | undefined;
    }[];
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | undefined;
    isCollapsed?: boolean | undefined;
}, {
    id: string;
    name: string;
    userId: string;
    feeds: {
        title: string;
        id: string;
        userId: string;
        url: string;
        feedUrl: string;
        unreadCount: number;
        description?: string | null | undefined;
        createdAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        sortOrder?: number | undefined;
        folderId?: string | null | undefined;
        faviconUrl?: string | null | undefined;
        lastFetchedAt?: string | null | undefined;
    }[];
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    color?: string | null | undefined;
    icon?: string | null | undefined;
    sortOrder?: number | undefined;
    isCollapsed?: boolean | undefined;
}>;
export type FolderWithFeeds = z.infer<typeof FolderWithFeedsSchema>;
export declare const OPMLFeedSchema: z.ZodObject<{
    title: z.ZodString;
    xmlUrl: z.ZodString;
    htmlUrl: z.ZodOptional<z.ZodString>;
    folder: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    xmlUrl: string;
    folder?: string | undefined;
    htmlUrl?: string | undefined;
}, {
    title: string;
    xmlUrl: string;
    folder?: string | undefined;
    htmlUrl?: string | undefined;
}>;
export type OPMLFeed = z.infer<typeof OPMLFeedSchema>;
export declare const OPMLImportSchema: z.ZodObject<{
    feeds: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        xmlUrl: z.ZodString;
        htmlUrl: z.ZodOptional<z.ZodString>;
        folder: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        xmlUrl: string;
        folder?: string | undefined;
        htmlUrl?: string | undefined;
    }, {
        title: string;
        xmlUrl: string;
        folder?: string | undefined;
        htmlUrl?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    feeds: {
        title: string;
        xmlUrl: string;
        folder?: string | undefined;
        htmlUrl?: string | undefined;
    }[];
}, {
    feeds: {
        title: string;
        xmlUrl: string;
        folder?: string | undefined;
        htmlUrl?: string | undefined;
    }[];
}>;
export type OPMLImportInput = z.infer<typeof OPMLImportSchema>;
export declare const RefreshRSSResponseSchema: z.ZodObject<{
    feedsProcessed: z.ZodNumber;
    articlesAdded: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    feedsProcessed: number;
    articlesAdded: number;
}, {
    feedsProcessed: number;
    articlesAdded: number;
}>;
export type RefreshRSSResponse = z.infer<typeof RefreshRSSResponseSchema>;
