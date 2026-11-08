import { useState } from "react";
import { useFeedStore } from "@/lib/store/feedStore";
import { Modal } from "../common/Modal";
import { cn } from "@/lib/utils/cn";

interface AddFeedDialogProps {
	onClose: () => void;
}

export function AddFeedDialog({ onClose }: AddFeedDialogProps) {
	const { folders, addFeed, isLoading } = useFeedStore();
	const [url, setUrl] = useState("");
	const [folderId, setFolderId] = useState<string>("");
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!url.trim()) return;

		setError(null);
		try {
			await addFeed(url.trim(), folderId || undefined);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "添加失败，请检查 URL");
		}
	};

	return (
		<Modal title="添加订阅源" onClose={onClose}>
			<form onSubmit={handleSubmit} className="p-5 space-y-4">
				<div>
					<label htmlFor="feed-url" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
						RSS/Atom Feed URL 或网站 URL
					</label>
					<input
						id="feed-url" type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://example.com/feed.xml"
						className={cn(
							"w-full px-3 py-2.5 rounded-lg text-sm",
							"bg-[var(--bg-card-hover)] border border-[var(--border)]",
							"text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
							"outline-none focus:border-[var(--accent)] focus:bg-[var(--bg-main)]",
							"transition-colors duration-150"
						)}
					/>
				</div>

				<div>
					<label htmlFor="feed-folder" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
						添加到文件夹（可选）
					</label>
					<select id="feed-folder"
						value={folderId}
						onChange={(e) => setFolderId(e.target.value)}
						className={cn(
							"w-full px-3 py-2.5 rounded-lg text-sm",
							"bg-[var(--bg-card-hover)] border border-[var(--border)]",
							"text-[var(--text-primary)] outline-none",
							"focus:border-[var(--accent)] transition-colors duration-150"
						)}
					>
						<option value="">不添加到文件夹</option>
						{folders.map((folder) => (
							<option key={folder.id} value={folder.id}>
								{folder.name}
							</option>
						))}
					</select>
				</div>

				{error && (
					<p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
						{error}
					</p>
				)}

				<div className="flex gap-2 pt-1">
					<button
						type="button"
						onClick={onClose}
						className={cn(
							"flex-1 px-4 py-2.5 rounded-lg text-sm font-medium",
							"bg-[var(--bg-card-hover)] text-[var(--text-secondary)]",
							"hover:bg-[var(--border)] transition-colors"
						)}
					>
						取消
					</button>
					<button
						type="submit"
						disabled={isLoading || !url.trim()}
						className={cn(
							"flex-1 px-4 py-2.5 rounded-lg text-sm font-medium",
							"bg-[var(--accent)] text-white",
							"hover:bg-[var(--accent-hover)] transition-colors",
							"disabled:opacity-50 disabled:cursor-not-allowed"
						)}
					>
						{isLoading ? "添加中…" : "添加"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
