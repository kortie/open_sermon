# bible-import 픽스처 (합성)

모두 직접 만든 시험 문장이다. 실제 성경 번역 본문은 넣지 않는다(CLAUDE.md 규칙 12, 21).

- `format-a.txt`, `format-b.txt`: UTF-8 형식 A, B
- `format-a-bom-crlf.txt`: `format-a.txt`에 UTF-8 BOM과 CRLF를 붙인 것
- `format-a-euckr.txt`, `format-b-euckr.txt`: `iconv -f UTF-8 -t EUC-KR`로 만든 같은 내용(열린 질문 14: UTF-8판과 같은 결과면 통과)
- `mixed.txt`: A·B 혼합(거부), `unknown.txt`: 형식 불명(거부)
