# Temporary perfect_freehand compatibility patch

- Upstream: https://github.com/sibaiper/perfect_freehand
- Published package: perfect_freehand 0.1.1, MIT (LICENSE.md retained).
- Upstream commit recorded by the release: e76196d9e8fddd5b31c1d9da7ba37a9041af7fdc.
- Registry archive SHA-256: a9fa6a5c34a2260773ed097c04182ceb594bb46178200d07b46cd16ac3ca4b0d.
- Sources copied in full from that published crate; CRLF and trailing whitespace are normalized.
- Only behavioral change: config/patches/perfect-freehand-end-cap.patch restores JavaScript 1.2.3's floating end-cap sampling loop.
- User approved this temporary downstream patch on 2026-10-30. Reproduction, issue drafts and removal condition: docs/upstream/perfect-freehand-end-cap.md.

Preserve upstream formatting. Use the repository's format:rust / format:rust:check scripts for owned workspace code. Do not treat this snapshot as an independently maintained implementation. Remove it and the Cargo override when an upstream release passes the unchanged numerical ink fixtures, CLI/desktop image parity, and full acceptance.
