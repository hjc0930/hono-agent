# Pagination Conventions

Common rule for every list endpoint. Issued 2026-09-25. First consumed by `module-auth-users/user-management.md`; all later list endpoints (tickets, comments, reports) reuse it.

## Request

List endpoints accept these query parameters:

| Query      | Type    | Default | Constraint |
| ---------- | ------- | ------- | ---------- |
| `page`     | integer | `1`     | `>= 1`     |
| `pageSize` | integer | `20`    | `1 .. 100` |

Values outside the constraints are rejected with `400 VALIDATION_ERROR`; omitted parameters use the defaults.

## Response

The envelope (see `api-response-comment.md`) carries the items in `data` and pagination metadata in a top-level `meta` sibling:

```json
{
  "path": "/api/users",
  "date": "2026-09-25T08:30:00.000Z",
  "message": "OK",
  "code": "OK",
  "data": [{ "id": "0b6b..." }, { "id": "4f2a..." }],
  "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
}
```

| Field             | Type    | Meaning                                           |
| ----------------- | ------- | ------------------------------------------------- |
| `meta.page`       | integer | The requested page (after defaulting)             |
| `meta.pageSize`   | integer | The applied page size (after defaulting)          |
| `meta.total`      | integer | Total number of matching rows                     |
| `meta.totalPages` | integer | `ceil(total / pageSize)`; `0` when `total` is `0` |

`data` is always an array for list endpoints, never `null`; an empty result is `[]`.

## Implementation mapping

| Piece                       | Responsibility                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/schemas/envelope.ts`   | `metaSchema` and `paginatedEnvelopeSchema(itemSchema)`                                                  |
| `src/lib/response.ts`       | `successEnvelope` accepts an optional `meta`                                                            |
| `src/schemas/pagination.ts` | `page`/`pageSize` query schema with `z.coerce` defaults and clamping                                    |
| Repositories                | A `list(filter)` returns `{ items, total }`; the repository applies offset/limit and runs a count query |

## Testing

Every list endpoint tests: default pagination, explicit `page`/`pageSize`, `total`/`totalPages` arithmetic (including the empty-list `0`/`0` case), and out-of-range values falling back to defaults.
