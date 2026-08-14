# Local database dumps

`export-db.bat`で作成したDBダンプを一時的に置くローカル用ディレクトリです。`*.sql`は個人情報や秘密設定を含む可能性があるためGit管理されません。

`nocode_db.sql`を配置した状態で新しいDockerボリュームを初回作成すると自動復元されます。Windows bat版では、空DBに対して`setup.bat`を実行すると復元されます。
