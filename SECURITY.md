# Security Policy

## Supported versions

公開後は最新のリリース系列を対象にセキュリティ修正を提供します。現在の`0.x`系列は開発版です。

## Reporting a vulnerability

脆弱性を発見した場合は、公開Issueへ再現情報や秘密情報を書き込まないでください。リポジトリ公開後はGitHub Security AdvisoriesのPrivate vulnerability reportingを利用してください。それまではプロジェクト管理者へ非公開で連絡してください。

報告には影響範囲、再現手順、想定される悪用方法、可能であれば修正案を含めてください。

## Deployment scope

本プロジェクトはLAN内・オフライン利用を主目的としています。インターネットへ直接公開する場合は、TLS、リバースプロキシ、ネットワーク制限、監視、バックアップ、秘密情報管理を追加してください。初期管理者パスワードとJWT秘密鍵はセットアップ時に生成され、Git管理対象にはなりません。
