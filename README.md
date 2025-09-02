## 🔒 プロジェクトルール（安全管理・開発方針）

- `.env.local` は GitHub に含めない（OpenAIキーなどを保護するため）
- `OPENAI_API_KEY` は Vercel の環境変数で管理する
- Assistant ID は `pages/api/assistant.ts` にハードコード（変わらない前提）
- コード変更時は `main` ブランチに直接Pushせず、Pull Requestを使う
- UI側にはスコアロジックや秘密情報は表示しない
