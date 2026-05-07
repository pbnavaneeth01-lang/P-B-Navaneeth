# Security Specification - GradeMaster

## Data Invariants
1. An Exam must belong to an authenticated user (`uid`).
2. A Submission must reference a valid `examId` and belong to the same user who owns the exam (or at least be associated with the user's `uid`).
3. Submissions can only be created by signed-in users.
4. Users cannot modify another user's exams or submissions.
5. Users cannot elevate their own privileges.

## The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Attempt to create an exam with `uid: "someone_else"`.
2. **Orphaned Write**: Create a submission for a non-existent `examId`.
3. **Ghost Field Injection**: Add a hidden `isVerified: true` field to an exam document.
4. **ID Poisoning**: Use a document ID containing 1.5KB of junk characters.
5. **State Shortcut**: Transition a submission from `pending` to `evaluated` without providing `evaluationData`.
6. **Cross-User Leak**: Attempt to list all submissions in the system without filtering by `uid`.
7. **PII Blanket Read**: Attempt to read private user profiles of other users.
8. **Resource Exhaustion**: Send a `title` string of 1MB.
9. **Timestamp Spoofing**: Provide a `createdAt` date from the future in the client payload.
10. **Immutable Field Escape**: Attempt to change `examId` in an existing `submission`.
11. **Shadow Join**: Attempt to join an exam as a student without authorization (not applicable to this app's current logic but worth noting).
12. **Unauthorized Deletion**: Attempt to delete another user's exam by guessing the ID.

## Test Runner (Conceptual)
The `firestore.rules` will be updated to block all these.
