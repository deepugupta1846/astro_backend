# Astro Backend API Documentation

Base URL (local): `http://localhost:5000`

## Common Notes

- All responses are JSON unless noted (e.g. Razorpay webhook uses raw JSON body).
- Success responses usually contain: `success: true`, optional `message`, and optional `data`.
- Error responses typically look like:
```json
{
  "success": false,
  "message": "Human-readable reason"
}
```
- Admin APIs require header:
  - `Authorization: Bearer <admin_jwt_token>`
- Path params are shown as `:id`, `:userId`, etc.
- **Wallet:** Two user top-up paths exist—legacy `/api/v1/user/wallet/*` (simple balance update, no `wallet_transactions` rows) and **recommended** `/api/v1/wallet/user/:userId/*` (Razorpay order + verify + history + webhook-compatible crediting). Prefer the `/api/v1/wallet/...` APIs for new apps.
- **Call billing:** When a consultation call ends (`PATCH .../calls/:callLogId/end`), the server automatically debits the **customer user** and credits the **astrologer** using `ceil(durationSeconds / 60) × astrologer.consultationFeePerMin`. Settlement is idempotent per call (`referenceId`: `call_{callLogId}`). You can also settle manually via `POST /api/v1/wallet/settle/call/:callLogId`.
- Real-time chat/consultation also uses **Socket.IO** (see `server.js` / `consultation.socket.js`); REST endpoints below cover sessions, messages, and calls.

---

## Upload API

### POST `/api/v1/upload/image`
- Content-Type: `multipart/form-data`
- Payload:
```text
image: <file>
```
- Dummy success response:
```json
{
  "success": true,
  "message": "Uploaded",
  "data": {
    "url": "http://localhost:5000/uploads/astro/1719999999999-abc12345.jpg"
  }
}
```

---

## User APIs

### POST `/api/v1/user/send-otp`
- Dummy payload:
```json
{
  "phone": "9876543210",
  "countryCode": "+91"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "expiresIn": 600,
    "sendOtpOnPhone": true
  }
}
```

### POST `/api/v1/user/verify-otp`
- Dummy payload:
```json
{
  "phone": "9876543210",
  "countryCode": "+91",
  "otp": "123456",
  "signupIntent": "astrologer"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "user": {
      "id": 12,
      "phone": "9876543210",
      "role": "astrologer",
      "name": "Deepu"
    },
    "existingUser": true
  }
}
```

### POST `/api/v1/user/wallet/create-order` (legacy)

Creates a Razorpay order and returns checkout fields. Does **not** write to `wallet_transactions`; balance is updated only via the matching verify endpoint.

- **Body (JSON):**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `userId` | number | Yes | Internal user id |
| `amount` | number | Yes | INR amount, minimum `1` |

- Dummy payload:
```json
{
  "userId": 12,
  "amount": 250.5
}
```
- Dummy success response:
```json
{
  "success": true,
  "message": "Wallet topup order created",
  "data": {
    "keyId": "rzp_test_AbCdEfGhIjKlMn",
    "orderId": "order_NwertyUiOpAsDf",
    "amount": 250.5,
    "amountPaise": 25050,
    "currency": "INR",
    "user": {
      "id": 12,
      "phone": "9876543210",
      "name": "Deepu",
      "role": "user"
    }
  }
}
```

### POST `/api/v1/user/wallet/verify` (legacy)

Verifies `razorpay_order_id|razorpay_payment_id` HMAC using server `RAZORPAY_KEY_SECRET`, then credits `users.wallet_balance`. Uses an in-memory set for duplicate `paymentId` in a single server process (not ideal for multi-instance; prefer `/api/v1/wallet/user/:userId/verify`).

- **Body (JSON):**

| Field | Type | Required |
| ----- | ---- | -------- |
| `userId` | number | Yes |
| `amount` | number | Yes (min `1`) |
| `razorpayOrderId` | string | Yes |
| `razorpayPaymentId` | string | Yes |
| `razorpaySignature` | string | Yes (from Razorpay Checkout success payload) |

- Dummy payload:
```json
{
  "userId": 12,
  "amount": 250.5,
  "razorpayOrderId": "order_NwertyUiOpAsDf",
  "razorpayPaymentId": "pay_LkJhGfDsAQWeRt",
  "razorpaySignature": "a1b2c3d4e5f67890abcdef1234567890abcdef12"
}
```
- Dummy success response (first time):
```json
{
  "success": true,
  "message": "Wallet topup successful",
  "data": {
    "user": {
      "id": 12,
      "phone": "9876543210",
      "name": "Deepu",
      "role": "user"
    },
    "walletBalance": 1250.5,
    "paymentId": "pay_LkJhGfDsAQWeRt",
    "orderId": "order_NwertyUiOpAsDf"
  }
}
```
- Dummy success response (duplicate `paymentId` in same process):
```json
{
  "success": true,
  "message": "Payment already processed",
  "data": {
    "user": { "id": 12, "phone": "9876543210", "name": "Deepu", "role": "user" },
    "walletBalance": 1250.5,
    "alreadyProcessed": true
  }
}
```

### POST `/api/v1/user/signup`
- Dummy payload:
```json
{
  "phone": "9876543210",
  "countryCode": "+91",
  "name": "Deepu",
  "gender": "male",
  "knowBirthTime": true,
  "birthTime": "11:43 AM",
  "birthDate": "1998-08-25",
  "birthPlace": "Delhi",
  "languages": ["English", "Hindi"],
  "email": "deepu@example.com",
  "password": "123456"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Signup successful",
  "data": {
    "user": {
      "id": 12,
      "name": "Deepu",
      "phone": "9876543210"
    }
  }
}
```

### POST `/api/v1/user/signin`
- Dummy payload (phone flow):
```json
{
  "phone": "9876543210"
}
```
- Dummy payload (email flow):
```json
{
  "email": "deepu@example.com",
  "password": "123456"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 12,
      "name": "Deepu"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### PUT `/api/v1/user/:id/push-token`
- Dummy payload:
```json
{
  "token": "fcm_device_token_here"
}
```
- Dummy response:
```json
{
  "success": true
}
```

### GET `/api/v1/user/:id/push-token`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "userId": 12,
    "fcmToken": "fcm_device_token_here",
    "fcmTokenUpdatedAt": "2026-05-01T05:14:20.000Z"
  }
}
```

### POST `/api/v1/user/:id/logout`
- Dummy payload:
```json
{}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### GET `/api/v1/user`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "name": "Deepu",
      "phone": "9876543210"
    }
  ]
}
```

### GET `/api/v1/user/:id`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 12,
    "name": "Deepu",
    "phone": "9876543210"
  }
}
```

### PUT `/api/v1/user/:id`
- Dummy payload:
```json
{
  "name": "Deepu Sharma",
  "birthPlace": "Mumbai",
  "languages": ["English", "Hindi"],
  "countryCode": "+91"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "id": 12,
    "name": "Deepu Sharma"
  }
}
```

### DELETE `/api/v1/user/:id`
- Dummy response:
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

---

## Wallet APIs (recommended — Razorpay + transaction history)

Base paths use **path parameters** for `userId` or `astrologerId` (must match the logged-in entity). Amounts are **INR** with two decimal places where applicable.

Environment variables used by these routes: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`; optional `WALLET_TOPUP_SUCCESS_RETURN_URL`, `WALLET_TOPUP_CANCEL_RETURN_URL` (surfaced in create-order JSON for app deep links).

### GET `/api/v1/wallet/user/:userId`

Wallet summary and recent transactions (last 20).

- Dummy response:
```json
{
  "success": true,
  "data": {
    "entityType": "user",
    "entityId": 12,
    "walletBalance": 1500,
    "recentTransactions": [
      {
        "id": 88,
        "entityType": "user",
        "entityId": 12,
        "type": "credit",
        "amount": "500.00",
        "balanceBefore": "1000.00",
        "balanceAfter": "1500.00",
        "currency": "INR",
        "status": "success",
        "source": "razorpay",
        "description": "Wallet top-up order (user)",
        "referenceId": null,
        "razorpayOrderId": "order_NwertyUiOpAsDf",
        "razorpayPaymentId": "pay_LkJhGfDsAQWeRt",
        "metadata": { "verifiedAt": "2026-05-09T10:15:30.000Z" },
        "createdAt": "2026-05-09T10:15:30.000Z",
        "updatedAt": "2026-05-09T10:15:30.000Z"
      }
    ]
  }
}
```

### GET `/api/v1/wallet/user/:userId/transactions`

Paginated history.

- **Query:** `limit` (default `50`, max `200`), `offset` (default `0`).
- Example: `/api/v1/wallet/user/12/transactions?limit=10&offset=0`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 88,
      "entityType": "user",
      "entityId": 12,
      "type": "credit",
      "amount": "500.00",
      "status": "success",
      "source": "razorpay",
      "razorpayOrderId": "order_NwertyUiOpAsDf",
      "razorpayPaymentId": "pay_LkJhGfDsAQWeRt",
      "createdAt": "2026-05-09T10:15:30.000Z"
    }
  ],
  "pagination": {
    "total": 24,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

### POST `/api/v1/wallet/user/:userId/create-order`

Creates a Razorpay order and a **pending** `wallet_transactions` row. Use returned `keyId`, `orderId`, and `amountPaise` in Razorpay Checkout (UPI / cards / etc.).

- **Body (JSON):**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `amount` | number | Yes | INR, minimum `1` |
| `description` | string | No | Max 300 chars, stored on pending tx |

- Dummy payload:
```json
{
  "amount": 499,
  "description": "Wallet top-up via UPI"
}
```
- Dummy success response:
```json
{  
  "success": true,
  "message": "Wallet topup order created",
  "data": {
    "keyId": "rzp_test_AbCdEfGhIjKlMn",
    "orderId": "order_NwertyUiOpAsDf",
    "amount": 499,
    "amountPaise": 49900,
    "currency": "INR",
    "entityType": "user",
    "entityId": 12,
    "checkout": {
      "provider": "razorpay",
      "hint": "Open Razorpay Checkout in the app with keyId + orderId + amount (paise). User can pay with UPI (PhonePe, Google Pay, etc.); the SDK returns control to your app after payment.",
      "suggestedMethods": ["upi", "card", "netbanking", "wallet"]
    },
    "redirect": {
      "successReturnUrl": "astrologer://wallet/topup/success",
      "cancelReturnUrl": "astrologer://wallet/topup/cancel"
    }
  }
}
```
*(If env URLs are unset, `successReturnUrl` / `cancelReturnUrl` are `null`.)*

### POST `/api/v1/wallet/user/:userId/verify`

Verifies payment signature and credits wallet **inside a DB transaction** (idempotent per `razorpayPaymentId`).

- **Body (JSON):**

| Field | Type | Required |
| ----- | ---- | -------- |
| `razorpayOrderId` | string | Yes |
| `razorpayPaymentId` | string | Yes |
| `razorpaySignature` | string | Yes |
| `amount` | number | Yes (must match pending order within tolerance) |

- Dummy payload:
```json
{
  "razorpayOrderId": "order_NwertyUiOpAsDf",
  "razorpayPaymentId": "pay_LkJhGfDsAQWeRt",
  "razorpaySignature": "a1b2c3d4e5f67890abcdef1234567890abcdef12",
  "amount": 499
}
```
- Dummy success response:
```json
{
  "success": true,
  "message": "Wallet topup successful",
  "data": {
    "entityType": "user",
    "entityId": 12,
    "walletBalance": 1999,
    "alreadyProcessed": false,
    "orderId": "order_NwertyUiOpAsDf",
    "paymentId": "pay_LkJhGfDsAQWeRt",
    "transactionId": 88
  }
}
```

### GET `/api/v1/wallet/user/:userId/razorpay/order-status/:orderId`

Poll Razorpay order state and linked wallet row (after returning from UPI app). `:orderId` is the Razorpay order id (e.g. `order_xxx`).

- Dummy response:
```json
{
  "success": true,
  "data": {
    "orderId": "order_NwertyUiOpAsDf",
    "razorpayOrderStatus": "paid",
    "amountPaise": 49900,
    "walletTransactionStatus": "success",
    "walletCredited": true,
    "payments": [
      {
        "id": "pay_LkJhGfDsAQWeRt",
        "status": "captured",
        "method": "upi"
      }
    ]
  }
}
```

---

### GET `/api/v1/wallet/astrologer/:astrologerId`

Same shape as user wallet; `entityType` is `"astrologer"`.

- Dummy response:
```json
{
  "success": true,
  "data": {
    "entityType": "astrologer",
    "entityId": 4,
    "walletBalance": 3200.75,
    "recentTransactions": []
  }
}
```

### GET `/api/v1/wallet/astrologer/:astrologerId/transactions`

- **Query:** `limit`, `offset` (same rules as user).

### POST `/api/v1/wallet/astrologer/:astrologerId/create-order`

- **Body:** Same as user (`amount`, optional `description`).
- **Response:** Same structure with `entityType: "astrologer"` and `entityId` matching path.

### POST `/api/v1/wallet/astrologer/:astrologerId/verify`

- **Body:** Same as user verify (`razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature`, `amount`).

### GET `/api/v1/wallet/astrologer/:astrologerId/razorpay/order-status/:orderId`

- Same behaviour as user order-status.

---

### POST `/api/v1/wallet/astrologer/:astrologerId/withdraw`

Astrologer requests a bank withdrawal (minimum **₹1000**). Amount is held from wallet immediately; status stays `pending` until admin approves.

- **Body:**

| Field | Type | Required |
| ----- | ---- | -------- |
| `userId` | number | Yes (logged-in astrologer user id) |
| `amount` | number | Yes, min 1000 |
| `accountHolderName` | string | Yes |
| `accountNumber` | string | Yes (9–18 digits) |
| `ifscCode` | string | Yes |
| `bankName` | string | Yes |
| `branchName` | string | No |

- Dummy payload:
```json
{
  "userId": 22,
  "amount": 1500,
  "accountHolderName": "Acharya Ravi",
  "accountNumber": "123456789012",
  "ifscCode": "SBIN0001234",
  "bankName": "State Bank of India",
  "branchName": "Main Branch"
}
```

- Dummy response (`201`):
```json
{
  "success": true,
  "message": "Withdrawal request submitted",
  "data": {
    "id": 3,
    "astrologerId": 4,
    "amount": 1500,
    "status": "pending",
    "accountNumber": "********9012",
    "walletBalance": 1700.75,
    "minWithdrawalAmount": 1000
  }
}
```

- Dummy error (below minimum):
```json
{
  "success": false,
  "message": "Minimum withdrawal amount is ₹1000"
}
```

---

### GET `/api/v1/wallet/astrologer/:astrologerId/withdrawals`

Astrologer's own withdrawal history.

- **Query:** `userId` (required), `limit` (default 20, max 50), `offset` (default 0)

- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "astrologerId": 4,
      "amount": 1500,
      "status": "pending",
      "bankName": "State Bank of India",
      "accountNumber": "********9012",
      "createdAt": "2026-06-02T10:00:00.000Z"
    }
  ],
  "minWithdrawalAmount": 1000
}
```

---

### POST `/api/v1/wallet/transfer/user-to-astrologer`

Internal settlement: debit user wallet, credit astrologer wallet, append two ledger rows (`source: consultation`). Uses a DB transaction.

- **Body (JSON):**

| Field | Type | Required |
| ----- | ---- | -------- |
| `userId` | number | Yes |
| `astrologerId` | number | Yes |
| `amount` | number | Yes, greater than 0 |
| `referenceId` | string | No (max 120) |
| `description` | string | No (max 300; default consultation settlement) |

- Dummy payload:
```json
{
  "userId": 12,
  "astrologerId": 4,
  "amount": 150,
  "referenceId": "session_101_close",
  "description": "Voice consultation 10 min"
}
```
- Dummy success response:
```json
{
  "success": true,
  "message": "Transfer completed",
  "data": {
    "amount": 150,
    "alreadyProcessed": false,
    "user": { "id": 12, "walletBalance": 1849 },
    "astrologer": { "id": 4, "walletBalance": 3350.75 },
    "referenceId": "session_101_close"
  }
}
```
- Dummy success (duplicate `referenceId` — no double charge):
```json
{
  "success": true,
  "message": "Transfer already processed",
  "data": {
    "amount": 150,
    "alreadyProcessed": true,
    "user": { "id": 12, "walletBalance": 1849 },
    "astrologer": { "id": 4, "walletBalance": 3350.75 },
    "referenceId": "session_101_close"
  }
}
```
- Dummy error (insufficient balance):
```json
{
  "success": false,
  "message": "Insufficient user wallet balance"
}
```

---

### POST `/api/v1/wallet/settle/call/:callLogId`

Settle wallet for a **completed** call using stored duration and the astrologer’s `consultationFeePerMin`. Same billing as automatic settlement on `PATCH .../calls/:callLogId/end`. Use for retries if needed.

- **Path:** `callLogId` — completed call log id (must have `endedAt` set).
- **Body:** none
- **Billing formula:** `amount = ceil(durationSeconds / 60) × consultationFeePerMin` (any started second counts as a full minute).

- Dummy request:
```http
POST /api/v1/wallet/settle/call/77
Content-Type: application/json
```
```json
{}
```

- Dummy success (settled — example: 185s at ₹10/min → 4 billable minutes → ₹40):
```json
{
  "success": true,
  "message": "Call consultation settled",
  "data": {
    "settled": true,
    "skipped": false,
    "amount": 40,
    "billableMinutes": 4,
    "feePerMin": 10,
    "durationSeconds": 185,
    "referenceId": "call_77",
    "alreadyProcessed": false,
    "user": { "id": 12, "walletBalance": 460 },
    "astrologer": { "id": 4, "walletBalance": 140 }
  }
}
```

- Dummy success (already settled):
```json
{
  "success": true,
  "message": "Call already settled",
  "data": {
    "settled": true,
    "skipped": false,
    "amount": 40,
    "billableMinutes": 4,
    "feePerMin": 10,
    "durationSeconds": 185,
    "referenceId": "call_77",
    "alreadyProcessed": true,
    "user": { "id": 12, "walletBalance": 460 },
    "astrologer": { "id": 4, "walletBalance": 140 }
  }
}
```

- Dummy success (nothing to charge — zero duration or astrologer rate is 0):
```json
{
  "success": true,
  "message": "No wallet charge for this call",
  "data": {
    "settled": false,
    "skipped": true,
    "reason": "zero_duration",
    "amount": 0,
    "billableMinutes": 0,
    "feePerMin": 0,
    "referenceId": "call_77"
  }
}
```

- Dummy error (call not ended):
```json
{
  "success": false,
  "message": "Call has not ended yet"
}
```

- Dummy error (insufficient balance):
```json
{
  "success": false,
  "message": "Insufficient user wallet balance"
}
```

---

## Razorpay webhook (server-to-server)

### POST `/api/v1/wallet/razorpay/webhook`

- **Purpose:** On `payment.captured`, credit the wallet if the mobile app never called `verify` (e.g. killed after UPI). Idempotent with the same logic as verify.
- **Content-Type:** `application/json`
- **Body:** Raw JSON event from Razorpay (not wrapped by your app).
- **Header:** `X-Razorpay-Signature` — HMAC-SHA256 of raw body using `RAZORPAY_WEBHOOK_SECRET` (from Razorpay Dashboard → Webhooks).
- **Configure:** Dashboard webhook URL `https://<your-host>/api/v1/wallet/razorpay/webhook`, subscribe at least to **`payment.captured`**.

Dummy **request** body (illustrative):
```json
{
  "entity": "event",
  "account_id": "acc_ABCDEF123456",
  "event": "payment.captured",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_LkJhGfDsAQWeRt",
        "entity": "payment",
        "amount": 49900,
        "currency": "INR",
        "status": "captured",
        "order_id": "order_NwertyUiOpAsDf",
        "method": "upi"
      }
    }
  },
  "created_at": 1746789000
}
```

Dummy **responses:**

Processed / credited:
```json
{ "received": true }
```

Event ignored (wrong type, unknown order, etc.):
```json
{ "received": true, "ignored": true }
```

Invalid signature:
```json
{
  "success": false,
  "message": "Invalid webhook signature"
}
```

---

## Astrologer APIs

### POST `/api/v1/astrologer/send-otp`

Astrologer-only OTP flow. If the phone is already registered as a **customer** (`role: user`), returns **409** — use a different number. Existing astrologer phones may receive OTP (login).

- Dummy payload:
```json
{
  "phone": "9876543210",
  "countryCode": "+91"
}
```
- Success response (same shape as user send-otp):
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "expiresIn": 600,
    "sendOtpOnPhone": true
  }
}
```
- Customer phone already registered:
```json
{
  "success": false,
  "message": "This number is already registered as a customer user. Please use a different number."
}
```

### POST `/api/v1/astrologer/verify-otp`

Verifies OTP for astrologer signup/login. Response matches user `verify-otp` with `signupIntent: "astrologer"`. Creates a `users` row with `role: astrologer` when new. Does **not** create the `astrologers` profile row — use `POST /api/v1/astrologer/register` after OTP for full KYC profile.

- Dummy payload:
```json
{
  "phone": "9876543210",
  "countryCode": "+91",
  "otp": "123456"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "user": {
      "id": 12,
      "phone": "9876543210",
      "role": "astrologer",
      "astrologerId": 4
    },
    "existingUser": true
  }
}
```
- Customer phone conflict (**409**): same message as send-otp.

### GET `/api/v1/astrologer`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 4,
      "name": "Acharya Ravi",
      "isOnline": true,
      "averageRating": 4.8
    }
  ]
}
```

### GET `/api/v1/astrologer/:id`

Public astrologer profile by primary key. **Excluded from JSON:** `phone`, `email`, `idProofType`, `idProofNumber`, `idProofImageUrl`, `idProofBackImageUrl` (same privacy rule as list).

- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 4,
    "userId": 22,
    "name": "Acharya Ravi",
    "countryCode": "+91",
    "gender": "male",
    "profileImageUrl": "http://localhost:5000/uploads/astro/1718000000000-abc12.jpg",
    "bio": "Vedic astrologer with 8+ years experience.",
    "experienceYears": 8,
    "education": "Jyotish Visharad",
    "specialties": ["Career", "Marriage"],
    "languages": ["Hindi", "English"],
    "skills": ["Vedic", "Prashna"],
    "consultationFeePerMin": 25,
    "averageRating": 4.8,
    "totalRatings": 120,
    "isOnline": true,
    "chatEnabled": true,
    "callEnabled": true,
    "videoEnabled": false,
    "walletBalance": "3200.75",
    "isVerified": true,
    "isActive": true,
    "createdAt": "2026-04-01T06:00:00.000Z",
    "updatedAt": "2026-05-09T09:00:00.000Z"
  }
}
```

### POST `/api/v1/astrologer/register`
- Dummy payload:
```json
{
  "phone": "9876543210",
  "countryCode": "+91",
  "name": "Acharya Ravi",
  "email": "ravi@example.com",
  "gender": "male",
  "profileImageUrl": "https://cdn.example.com/profile.jpg",
  "idProofType": "aadhaar",
  "idProofNumber": "1234-5678-9012",
  "idProofImageUrl": "https://cdn.example.com/id-front.jpg",
  "idProofBackImageUrl": "https://cdn.example.com/id-back.jpg",
  "bio": "Vedic astrologer",
  "experienceYears": 8,
  "education": "Jyotish Visharad",
  "specialties": ["Career", "Marriage"],
  "languages": ["Hindi", "English"],
  "skills": ["Vedic", "Tarot"],
  "consultationFeePerMin": 25,
  "chatEnabled": true,
  "callEnabled": true,
  "videoEnabled": false,
  "birthDate": "1990-01-10",
  "birthTime": "06:40 AM",
  "birthPlace": "Jaipur"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Registered as astrologer successfully",
  "data": {
    "user": {
      "id": 12,
      "role": "astrologer"
    },
    "astrologer": {
      "id": 4,
      "name": "Acharya Ravi",
      "phone": "9876543210"
    }
  }
}
```

### POST `/api/v1/astrologer`
- Dummy payload:
```json
{
  "name": "Acharya Ravi",
  "phone": "9876543210",
  "countryCode": "+91",
  "specialties": ["Career"],
  "languages": ["Hindi"],
  "consultationFeePerMin": 20
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Astrologer created successfully",
  "data": {
    "id": 4,
    "name": "Acharya Ravi",
    "phone": "9876543210"
  }
}
```

---

## Consultation APIs

### POST `/api/v1/consultation/sessions`
- Dummy payload:
```json
{
  "customerUserId": 12,
  "astrologerId": 4
}
```
- Dummy response:
```json
{
  "success": true,
  "data": {
    "session": {
      "id": 101,
      "customerUserId": 12,
      "astrologerUserId": 22,
      "astrologerId": 4,
      "channelName": "astro_session_101",
      "status": "active"
    },
    "agoraAppId": "your_agora_app_id",
    "customer": { "userId": 12, "name": "Deepu", "profileImageUrl": null },
    "astrologerUser": { "userId": 22, "name": "Acharya Ravi", "profileImageUrl": null }
  }
}
```

### GET `/api/v1/consultation/sessions/for-participant/:userId?perspective=customer&includeClosed=false`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "session": {
        "id": 101,
        "customerUserId": 12,
        "astrologerUserId": 22,
        "status": "active"
      },
      "customerDisplayName": "Deepu",
      "astrologerDisplayName": "Acharya Ravi",
      "unreadCount": 2,
      "lastMessage": {
        "body": "Namaste",
        "createdAt": "2026-05-01T05:00:00.000Z",
        "senderUserId": 22,
        "messageType": "text"
      },
      "lastActivityAt": "2026-05-01T05:00:00.000Z"
    }
  ]
}
```

### GET `/api/v1/consultation/sessions/:sessionId/summary?forUserId=12`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "session": {
      "id": 101,
      "channelName": "astro_session_101",
      "status": "active"
    },
    "agoraAppId": "your_agora_app_id",
    "customer": { "userId": 12, "name": "Deepu", "profileImageUrl": null },
    "astrologerUser": { "userId": 22, "name": "Acharya Ravi", "profileImageUrl": null }
  }
}
```

### POST `/api/v1/consultation/sessions/:sessionId/read`
- Dummy payload:
```json
{
  "readerUserId": 12
}
```
- Dummy response:
```json
{
  "success": true,
  "data": {
    "count": 5
  }
}
```

### POST `/api/v1/consultation/sessions/:sessionId/messages/mark-delivered`
- Dummy payload:
```json
{
  "readerUserId": 12,
  "messageIds": [501, 502, 503]
}
```
- Dummy response:
```json
{
  "success": true
}
```

### GET `/api/v1/consultation/sessions/:id/messages?limit=50`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 501,
      "sessionId": 101,
      "senderUserId": 12,
      "body": "Hello",
      "messageType": "text",
      "createdAt": "2026-05-01T05:00:00.000Z",
      "deliveredAt": "2026-05-01T05:00:05.000Z",
      "readAt": null
    }
  ]
}
```

### POST `/api/v1/consultation/sessions/:id/messages`
- Dummy payload:
```json
{
  "senderUserId": 12,
  "body": "https://cdn.example.com/chat-image.jpg",
  "messageType": "image"
}
```
- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 520,
    "sessionId": 101,
    "senderUserId": 12,
    "body": "https://cdn.example.com/chat-image.jpg",
    "messageType": "image",
    "createdAt": "2026-05-01T05:01:00.000Z",
    "deliveredAt": null,
    "readAt": null
  }
}
```

### POST `/api/v1/consultation/agora/rtc-token`
- Dummy payload:
```json
{
  "channelName": "astro_session_101",
  "uid": 12,
  "sessionId": 101
}
```
- Dummy response:
```json
{
  "success": true,
  "data": {
    "token": "007eJxTY...",
    "channelName": "astro_session_101",
    "uid": 12,
    "appId": "your_agora_app_id"
  }
}
```

### POST `/api/v1/consultation/sessions/:id/call/start`
- Dummy payload:
```json
{
  "callType": "voice",
  "startedByUserId": 12
}
```
- Dummy response:
```json
{
  "success": true,
  "data": {
    "callLogId": 77,
    "channelName": "astro_session_101",
    "callType": "voice"
  }
}
```

### GET `/api/v1/consultation/calls/history/:userId?limit=50`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 77,
      "sessionId": 101,
      "astrologerId": 4,
      "callType": "voice",
      "startedByUserId": 12,
      "startedAt": "2026-05-01T04:30:00.000Z",
      "endedAt": "2026-05-01T04:40:00.000Z",
      "durationSeconds": 600,
      "direction": "outgoing",
      "peerUserId": 22,
      "peerName": "Acharya Ravi"
    }
  ]
}
```

### PATCH `/api/v1/consultation/calls/:callLogId/end`

Ends the call, records `durationSeconds`, and **automatically settles** the customer → astrologer wallet transfer (see **Call billing** in Common Notes). Idempotent: calling end twice does not double-charge.

- **Body:** none required

- Dummy request:
```http
PATCH /api/v1/consultation/calls/77/end
Content-Type: application/json
```
```json
{}
```

- Dummy response (with wallet settlement — 600s at ₹15/min → 10 min → ₹150):
```json
{
  "success": true,
  "data": {
    "id": 77,
    "endedAt": "2026-05-01T04:40:00.000Z",
    "durationSeconds": 600,
    "walletSettlement": {
      "settled": true,
      "skipped": false,
      "amount": 150,
      "billableMinutes": 10,
      "feePerMin": 15,
      "durationSeconds": 600,
      "referenceId": "call_77",
      "alreadyProcessed": false,
      "user": { "id": 12, "walletBalance": 1850 },
      "astrologer": { "id": 4, "walletBalance": 3500.75 }
    }
  }
}
```

- Dummy response (insufficient user balance — HTTP 400):
```json
{
  "success": false,
  "message": "Insufficient user wallet balance"
}
```

- Dummy response (call already ended; settlement already processed):
```json
{
  "success": true,
  "data": {
    "id": 77,
    "endedAt": "2026-05-01T04:40:00.000Z",
    "durationSeconds": 600,
    "walletSettlement": {
      "settled": true,
      "skipped": false,
      "amount": 150,
      "billableMinutes": 10,
      "feePerMin": 15,
      "durationSeconds": 600,
      "referenceId": "call_77",
      "alreadyProcessed": true,
      "user": { "id": 12, "walletBalance": 1850 },
      "astrologer": { "id": 4, "walletBalance": 3500.75 }
    }
  }
}
```

---

## Admin APIs (Authorization required)

Use header:
```text
Authorization: Bearer <admin_jwt_token>
```

### GET `/api/v1/admin/me`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Admin User",
    "role": "admin"
  }
}
```

### GET `/api/v1/admin/notifications`

Lists notifications for the **authenticated admin user** (e.g. system alerts, new puja bookings if wired).

- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 901,
      "userId": 1,
      "title": "New Puja Booking",
      "body": "Deepu requested Maha Mrityunjaya Jaap",
      "payload": {
        "type": "puja_booking",
        "bookingId": "21"
      },
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-05-09T08:00:00.000Z"
    }
  ]
}
```

### GET `/api/v1/admin/users`
- Dummy response:
```json
{
  "success": true,
  "data": [
    { "id": 12, "name": "Deepu", "phone": "9876543210", "role": "user" }
  ]
}
```

### GET `/api/v1/admin/users/:id`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 12,
    "name": "Deepu",
    "phone": "9876543210",
    "role": "user"
  }
}
```

### PUT `/api/v1/admin/users/:id`
- Dummy payload:
```json
{
  "name": "Deepu Admin Updated",
  "role": "astrologer",
  "isActive": true,
  "walletBalance": 500
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "User updated",
  "data": {
    "id": 12,
    "name": "Deepu Admin Updated",
    "role": "astrologer"
  }
}
```

### DELETE `/api/v1/admin/users/:id`
- Dummy response:
```json
{
  "success": true,
  "message": "User deleted"
}
```

### GET `/api/v1/admin/astrologers`
- Dummy response:
```json
{
  "success": true,
  "data": [
    { "id": 4, "name": "Acharya Ravi", "isActive": true, "isVerified": false }
  ]
}
```

### GET `/api/v1/admin/astrologers/:id`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 4,
    "name": "Acharya Ravi",
    "phone": "9876543210"
  }
}
```

### PUT `/api/v1/admin/astrologers/:id`
- Dummy payload:
```json
{
  "consultationFeePerMin": 30,
  "isVerified": true,
  "isActive": true,
  "isOnline": true
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Astrologer updated",
  "data": {
    "id": 4,
    "consultationFeePerMin": 30,
    "isVerified": true
  }
}
```

### POST `/api/v1/admin/astrologers`
- Dummy payload:
```json
{
  "name": "Acharya New",
  "phone": "9999999999",
  "countryCode": "+91",
  "consultationFeePerMin": 25,
  "languages": ["Hindi"]
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Astrologer created successfully",
  "data": {
    "id": 9,
    "name": "Acharya New",
    "phone": "9999999999"
  }
}
```

### GET `/api/v1/admin/remedies`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Wear Rudraksha",
      "slug": "wear-rudraksha",
      "isActive": true
    }
  ]
}
```

### GET `/api/v1/admin/remedies/:id`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "Wear Rudraksha",
    "description": "Wear 5 mukhi rudraksha for peace."
  }
}
```

### POST `/api/v1/admin/remedies`
- Dummy payload:
```json
{
  "title": "Donate Yellow Clothes",
  "description": "Donate yellow clothes on Thursday.",
  "slug": "donate-yellow-clothes",
  "category": "Jupiter",
  "imageUrl": "https://cdn.example.com/remedy.jpg",
  "tags": ["jupiter", "career"],
  "isActive": true,
  "priority": 10
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Remedy created",
  "data": {
    "id": 5,
    "title": "Donate Yellow Clothes",
    "slug": "donate-yellow-clothes"
  }
}
```

### PUT `/api/v1/admin/remedies/:id`
- Dummy payload:
```json
{
  "title": "Donate Yellow Items",
  "isActive": true,
  "priority": 8
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Remedy updated",
  "data": {
    "id": 5,
    "title": "Donate Yellow Items",
    "priority": 8
  }
}
```

### DELETE `/api/v1/admin/remedies/:id`
- Dummy response:
```json
{
  "success": true,
  "message": "Remedy deleted"
}
```

### GET `/api/v1/admin/withdrawals`

List all astrologer withdrawal requests (full bank details for admin).

- **Query (optional):** `status` (`pending` | `approved` | `rejected` | `cancelled`), `astrologerId`, `limit` (default 50, max 100), `offset`

- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "astrologerId": 4,
      "requestedByUserId": 22,
      "amount": 1500,
      "status": "pending",
      "accountHolderName": "Acharya Ravi",
      "accountNumber": "123456789012",
      "ifscCode": "SBIN0001234",
      "bankName": "State Bank of India",
      "branchName": "Main Branch",
      "rejectionReason": null,
      "walletTransactionId": 88,
      "astrologer": {
        "id": 4,
        "name": "Acharya Ravi",
        "phone": "9876543210",
        "walletBalance": 1700.75
      },
      "createdAt": "2026-06-02T10:00:00.000Z",
      "updatedAt": "2026-06-02T10:00:00.000Z"
    }
  ]
}
```

### GET `/api/v1/admin/withdrawals/:id`

- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 3,
    "astrologerId": 4,
    "amount": 1500,
    "status": "pending",
    "accountHolderName": "Acharya Ravi",
    "accountNumber": "123456789012",
    "ifscCode": "SBIN0001234",
    "bankName": "State Bank of India"
  }
}
```

### PUT `/api/v1/admin/withdrawals/:id`

Update withdrawal (typically change status). Only **pending** requests can change status.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `status` | string | `approved`, `rejected`, or `cancelled` |
| `rejectionReason` | string | Required when `status` is `rejected` |
| `amount` | number | Only while `pending`; min ₹1000 |
| `accountHolderName`, `accountNumber`, `ifscCode`, `bankName`, `branchName` | | Editable while `pending` |

- **Approve** — marks request approved; wallet debit transaction becomes `success` (funds already held).
- **Reject / Cancel** — refunds amount to astrologer wallet; transaction marked `failed`.

- Dummy payload (approve):
```json
{
  "status": "approved"
}
```

- Dummy payload (reject):
```json
{
  "status": "rejected",
  "rejectionReason": "Invalid bank account details"
}
```

- Dummy response:
```json
{
  "success": true,
  "message": "Withdrawal updated",
  "data": {
    "id": 3,
    "status": "approved",
    "amount": 1500
  }
}
```

### DELETE `/api/v1/admin/withdrawals/:id`

- **Pending:** refunds wallet balance and deletes the request.
- **Approved:** not allowed (`400`).
- **Rejected / Cancelled:** deletes record only (already refunded on reject).

- Dummy response:
```json
{
  "success": true,
  "message": "Withdrawal deleted"
}
```

### GET `/api/v1/admin/pujas`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 11,
      "title": "Maha Mrityunjaya Jaap",
      "category": "Vedic",
      "thumbnailImageUrl": "https://cdn.example.com/puja-thumb.jpg",
      "price": "2100.00",
      "durationMinutes": 90,
      "priority": 3,
      "isTrending": true,
      "isActive": true
    }
  ]
}
```

### GET `/api/v1/admin/pujas/:id`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 11,
    "title": "Maha Mrityunjaya Jaap",
    "slug": "maha-mrityunjaya-jaap",
    "category": "Vedic",
    "shortDescription": "For health and protection",
    "description": "<p>Detailed puja process...</p>",
    "thumbnailImageUrl": "https://cdn.example.com/puja-thumb.jpg",
    "price": "2100.00",
    "originalPrice": "3100.00",
    "durationMinutes": 90,
    "durationHours": 1,
    "durationRemainingMinutes": 30,
    "tags": ["health", "protection"],
    "benefits": ["Peace", "Relief from fear"],
    "isTrending": true,
    "isActive": true,
    "priority": 3
  }
}
```

### POST `/api/v1/admin/pujas`
- Content-Type: `multipart/form-data`
- Dummy payload:
```text
title: Maha Mrityunjaya Jaap
slug: maha-mrityunjaya-jaap
category: Vedic
shortDescription: For health and protection
description: <p>Detailed puja process...</p>
price: 2100
originalPrice: 3100
durationHours: 1
durationMinutes: 30
tags: ["health","protection"]
benefits: ["Peace","Relief from fear"]
thumbnailImageUrl: https://cdn.example.com/puja-thumb.jpg
isTrending: true
isActive: true
priority: high
image: <file>
```
- Dummy response:
```json
{
  "success": true,
  "message": "Puja created",
  "data": {
    "id": 11,
    "title": "Maha Mrityunjaya Jaap",
    "slug": "maha-mrityunjaya-jaap"
  }
}
```

### PUT `/api/v1/admin/pujas/:id`
- Content-Type: `multipart/form-data`
- Dummy payload:
```text
title: Maha Mrityunjaya Jaap - Updated
durationHours: 2
durationMinutes: 0
thumbnailImageUrl: https://cdn.example.com/puja-thumb-updated.jpg
priority: medium
isTrending: false
image: <optional file>
```
- Dummy response:
```json
{
  "success": true,
  "message": "Puja updated",
  "data": {
    "id": 11,
    "title": "Maha Mrityunjaya Jaap - Updated",
    "durationMinutes": 120
  }
}
```

### DELETE `/api/v1/admin/pujas/:id`
- Dummy response:
```json
{
  "success": true,
  "message": "Puja deleted"
}
```

### GET `/api/v1/admin/puja-bookings`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 21,
      "pujaId": 11,
      "userId": 12,
      "name": "Rahul Sharma",
      "phone": "9876543210",
      "email": "rahul@example.com",
      "city": "Jaipur",
      "preferredDate": "2026-05-10",
      "preferredTime": "10:30 AM",
      "notes": "Please call before puja timing.",
      "amount": "2100.00",
      "status": "pending",
      "Puja": {
        "id": 11,
        "title": "Maha Mrityunjaya Jaap",
        "category": "Vedic",
        "price": "2100.00"
      },
      "User": {
        "id": 12,
        "name": "Rahul Sharma",
        "phone": "9876543210",
        "email": "rahul@example.com"
      },
      "createdAt": "2026-05-01T11:00:00.000Z"
    }
  ]
}
```

### PUT `/api/v1/admin/puja-bookings/:id/status`
- Dummy payload:
```json
{
  "status": "confirmed"
}
```
- Allowed status values: `pending`, `confirmed`, `completed`, `cancelled`
- Dummy response:
```json
{
  "success": true,
  "message": "Booking status updated",
  "data": {
    "id": 21,
    "status": "confirmed"
  }
}
```

### GET `/api/v1/admin/users/:id/kundlis`
- Dummy response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 12,
      "name": "Deepu",
      "phone": "9876543210"
    },
    "kundlis": [
      {
        "id": 7,
        "userId": 12,
        "title": "Birth Kundli",
        "fileUrl": "http://localhost:5000/uploads/kundli/1719999-file.pdf",
        "fileType": "application/pdf",
        "createdAt": "2026-05-01T10:00:00.000Z"
      }
    ]
  }
}
```

### GET `/api/v1/admin/kundlis`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 7,
      "userId": 12,
      "title": "Birth Kundli",
      "fileUrl": "http://localhost:5000/uploads/kundli/1719999-file.pdf",
      "fileType": "application/pdf",
      "User": {
        "id": 12,
        "name": "Deepu",
        "phone": "9876543210",
        "email": "deepu@example.com"
      }
    }
  ]
}
```

### PUT `/api/v1/admin/kundlis/:id`
- Content-Type: `multipart/form-data`
- Dummy payload:
```text
title: Updated Birth Kundli
notes: Verified by admin
file: <optional image/pdf>
```
- Dummy response:
```json
{
  "success": true,
  "message": "Kundli updated",
  "data": {
    "id": 7,
    "title": "Updated Birth Kundli",
    "notes": "Verified by admin"
  }
}
```

---

## Kundli APIs (User App)

### POST `/api/v1/user/:id/kundlis`
- Content-Type: `multipart/form-data`
- Dummy payload:
```text
file: <image or pdf>
title: Birth Kundli
notes: Generated from DOB details
```
- Dummy response:
```json
{
  "success": true,
  "message": "Kundli uploaded successfully",
  "data": {
    "id": 7,
    "userId": 12,
    "title": "Birth Kundli",
    "fileUrl": "http://localhost:5000/uploads/kundli/1719999-file.pdf",
    "fileType": "application/pdf",
    "originalName": "kundli.pdf"
  }
}
```

### GET `/api/v1/user/:id/kundlis`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 7,
      "userId": 12,
      "title": "Birth Kundli",
      "fileUrl": "http://localhost:5000/uploads/kundli/1719999-file.pdf",
      "fileType": "application/pdf",
      "createdAt": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

---

## Notification APIs (User App)

### GET `/api/v1/user/:id/notifications`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 33,
      "userId": 12,
      "title": "Acharya Ravi",
      "body": "sent you a photo",
      "payload": {
        "type": "chat_message",
        "sessionId": "101",
        "senderUserId": "22"
      },
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-05-01T10:30:00.000Z"
    }
  ]
}
```

### PUT `/api/v1/user/:id/notifications/:notificationId/read`
- Dummy payload:
```json
{}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {
    "id": 33,
    "isRead": true,
    "readAt": "2026-05-01T10:35:00.000Z"
  }
}
```

---

## Puja APIs (Public/User)

### GET `/api/v1/pujas`
- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "id": 11,
      "title": "Maha Mrityunjaya Jaap",
      "category": "Vedic",
      "price": "2100.00",
      "durationMinutes": 90,
      "isActive": true
    }
  ]
}
```

### POST `/api/v1/pujas/book`

**Required:** `pujaId`, `name`, `phone`. **Optional:** `userId`, `email`, `city`, `preferredDate`, `preferredTime`, `notes`. Booking `amount` is taken from the puja price server-side.

- Dummy payload:
```json
{
  "pujaId": 11,
  "userId": 12,
  "name": "Deepu Sharma",
  "phone": "9876543210",
  "email": "deepu@example.com",
  "city": "Jaipur",
  "preferredDate": "2026-05-15",
  "preferredTime": "10:30 AM",
  "notes": "Morning slot preferred"
}
```
- **HTTP status:** `201 Created` on success.
- Dummy response:
```json
{
  "success": true,
  "message": "Puja booking created",
  "data": {
    "id": 21,
    "pujaId": 11,
    "name": "Deepu Sharma",
    "phone": "9876543210",
    "email": "deepu@example.com",
    "city": "Jaipur",
    "preferredDate": "2026-05-15",
    "preferredTime": "10:30 AM",
    "amount": "2100.00",
    "status": "pending"
  }
}
```

---

## Latest APIs — Chat request, accept/decline, end & billing

New consultation flow: customer **requests** chat → astrologer **accepts** or **declines** → on accept, timer starts → either party **ends chat** → wallet settles per minute. Voice/video **calls** still use `POST .../call/start` and `PATCH .../calls/:callLogId/end` (billing on call end).

**DB:** Run `migrations/add_consultation_request_fields.sql` once if `consultation_sessions` is missing `request_status`, `chat_started_at`, `chat_ended_at`, `billed_amount`.

**Session fields (new):**

| Field | Values | Notes |
| ----- | ------ | ----- |
| `requestStatus` | `pending`, `accepted`, `declined` | `null` on legacy rows = treated as `accepted` |
| `chatStartedAt` | ISO datetime | Set when astrologer accepts |
| `chatEndedAt` | ISO datetime | Set when chat ends |
| `billedAmount` | number | INR charged on end chat |

**Billing:** `amount = ceil(durationSeconds / 60) × consultationFeePerMin` (any started second = full minute). Chat uses `referenceId` `session_{sessionId}`; calls use `call_{callLogId}`.

**Socket.IO (real-time):** Event `session_updated` — payload includes `sessionId`, `requestStatus`, `action` (`created` \| `accepted` \| `declined` \| `ended`), optional `chatStartedAt`, `walletSettlement`.

---

### POST `/api/v1/consultation/sessions` (chat request)

Creates or returns an **active** session between customer and astrologer. **New** sessions start with `requestStatus: "pending"` until the astrologer accepts. Push notification sent to astrologer on first create.

- **Body (JSON):**

| Field | Type | Required |
| ----- | ---- | -------- |
| `customerUserId` | number | Yes |
| `astrologerId` | number | Yes (FK `astrologers.id`) |

- Dummy payload:
```json
{
  "customerUserId": 12,
  "astrologerId": 4
}
```

- Dummy response (new pending request):
```json
{
  "success": true,
  "data": {
    "session": {
      "id": 101,
      "customerUserId": 12,
      "astrologerUserId": 22,
      "astrologerId": 4,
      "channelName": "astro_session_101",
      "status": "active",
      "requestStatus": "pending",
      "chatStartedAt": null,
      "chatEndedAt": null,
      "billedAmount": null,
      "createdAt": "2026-05-18T10:00:00.000Z"
    },
    "agoraAppId": "your_agora_app_id",
    "customer": {
      "userId": 12,
      "name": "Deepu",
      "profileImageUrl": null
    },
    "astrologerUser": {
      "userId": 22,
      "name": "Acharya Ravi",
      "profileImageUrl": null
    },
    "astrologerProfile": {
      "id": 4,
      "name": "Acharya Ravi",
      "bio": "Vedic astrologer with 8+ years experience.",
      "experienceYears": 8,
      "education": "Jyotish Visharad",
      "skills": ["Vedic", "Prashna"],
      "specialties": ["Career", "Marriage"],
      "languages": ["Hindi", "English"],
      "consultationFeePerMin": 25,
      "averageRating": 4.8,
      "totalConsultations": 120,
      "profileImageUrl": "http://localhost:5000/uploads/astro/profile.jpg",
      "chatEnabled": true,
      "callEnabled": true,
      "videoEnabled": false,
      "isOnline": true
    }
  }
}
```

- Dummy error (cannot chat with yourself):
```json
{
  "success": false,
  "message": "Cannot open session with yourself"
}
```

---

### GET `/api/v1/consultation/sessions/for-participant/:userId?perspective=astrologer&pendingOnly=true`

List sessions for inbox / **astrologer Requests** tab. Add `pendingOnly=true` to return only chat requests waiting for accept.

| Query | Description |
| ----- | ----------- |
| `perspective` | `customer` \| `astrologer` (optional) |
| `includeClosed` | `true` to include closed sessions |
| `pendingOnly` | `true` — only `requestStatus: pending` (astrologer queue) |

- Example:
```http
GET /api/v1/consultation/sessions/for-participant/22?perspective=astrologer&pendingOnly=true
```

- Dummy response:
```json
{
  "success": true,
  "data": [
    {
      "session": {
        "id": 101,
        "customerUserId": 12,
        "astrologerUserId": 22,
        "astrologerId": 4,
        "channelName": "astro_session_101",
        "status": "active",
        "requestStatus": "pending",
        "chatStartedAt": null,
        "chatEndedAt": null,
        "billedAmount": null,
        "createdAt": "2026-05-18T10:00:00.000Z"
      },
      "customerDisplayName": "Deepu",
      "astrologerDisplayName": "Acharya Ravi",
      "customerProfileImageUrl": null,
      "astrologerProfileImageUrl": "http://localhost:5000/uploads/astro/profile.jpg",
      "unreadCount": 0,
      "lastMessage": null,
      "lastActivityAt": "2026-05-18T10:00:00.000Z"
    }
  ]
}
```

---

### POST `/api/v1/consultation/sessions/:sessionId/accept`

Astrologer accepts a **pending** chat request. Sets `requestStatus: accepted`, `chatStartedAt` = now. Customer receives push + `session_updated` socket event. Messaging and calls allowed after accept.

- **Body (JSON):**

| Field | Type | Required |
| ----- | ---- | -------- |
| `actorUserId` | number | Yes — must be `astrologerUserId` for this session |

- Dummy payload:
```json
{
  "actorUserId": 22
}
```

- Dummy success response:
```json
{
  "success": true,
  "message": "Chat request accepted",
  "data": {
    "session": {
      "id": 101,
      "customerUserId": 12,
      "astrologerUserId": 22,
      "astrologerId": 4,
      "channelName": "astro_session_101",
      "status": "active",
      "requestStatus": "accepted",
      "chatStartedAt": "2026-05-18T10:05:00.000Z",
      "chatEndedAt": null,
      "billedAmount": null,
      "createdAt": "2026-05-18T10:00:00.000Z"
    }
  }
}
```

- Dummy error (not astrologer):
```json
{
  "success": false,
  "message": "Only the astrologer can accept this request"
}
```

---

### POST `/api/v1/consultation/sessions/:sessionId/decline`

Astrologer declines a **pending** request. Sets `requestStatus: declined`, `status: closed`. Customer receives push + socket event.

- **Body (JSON):**

| Field | Type | Required |
| ----- | ---- | -------- |
| `actorUserId` | number | Yes — astrologer user id |

- Dummy payload:
```json
{
  "actorUserId": 22
}
```

- Dummy success response:
```json
{
  "success": true,
  "message": "Chat request declined",
  "data": {
    "session": {
      "id": 101,
      "requestStatus": "declined",
      "status": "closed",
      "chatEndedAt": "2026-05-18T10:06:00.000Z"
    }
  }
}
```

---

### POST `/api/v1/consultation/sessions/:sessionId/end`

Ends an **accepted** chat, closes the session, and **settles wallet** (debit user, credit astrologer). Either participant may call. Idempotent wallet via `referenceId` `session_{sessionId}`.

- **Body (JSON):**

| Field | Type | Required |
| ----- | ---- | -------- |
| `actorUserId` | number | Yes — customer or astrologer user id |

- Dummy payload:
```json
{
  "actorUserId": 12
}
```

- Dummy success response (e.g. 7 minutes at ₹25/min → ₹175):
```json
{
  "success": true,
  "message": "Chat ended",
  "data": {
    "session": {
      "id": 101,
      "status": "closed",
      "requestStatus": "accepted",
      "chatStartedAt": "2026-05-18T10:05:00.000Z",
      "chatEndedAt": "2026-05-18T10:12:00.000Z",
      "billedAmount": 175
    },
    "durationSeconds": 420,
    "walletSettlement": {
      "settled": true,
      "skipped": false,
      "amount": 175,
      "billableMinutes": 7,
      "feePerMin": 25,
      "durationSeconds": 420,
      "referenceId": "session_101",
      "alreadyProcessed": false,
      "user": { "id": 12, "walletBalance": 825 },
      "astrologer": { "id": 4, "walletBalance": 3375.75 }
    }
  }
}
```

- Dummy error (insufficient balance):
```json
{
  "success": false,
  "message": "Insufficient user wallet balance"
}
```

- Dummy error (chat not accepted yet):
```json
{
  "success": false,
  "message": "Chat was not active"
}
```

---

### POST `/api/v1/consultation/sessions/:id/messages` (guard when pending)

Messages are allowed only when `requestStatus` is `accepted`.

- Dummy error (pending request):
```json
{
  "success": false,
  "message": "Waiting for astrologer to accept the chat request"
}
```

---

### POST `/api/v1/consultation/sessions/:id/call/start` (requires accepted chat)

Voice/video call cannot start until the chat request is accepted.

- Dummy payload:
```json
{
  "callType": "voice",
  "startedByUserId": 12
}
```

- Dummy error (not accepted):
```json
{
  "success": false,
  "message": "Chat must be accepted before starting a call"
}
```

---

### PATCH `/api/v1/consultation/calls/:callLogId/end` (call billing)

Unchanged endpoint; ends call and auto-settles wallet using call duration. See [Consultation APIs](#consultation-apis) and **Call billing** in Common Notes.

- Dummy response includes `walletSettlement` (same shape as chat end).

---

### GET `/api/v1/astrologer/:id` (profile before request)

Used by the app to show fee/min, skills, experience before **Request chat**. Documented in [Astrologer APIs](#astrologer-apis); no change to route.

---

### Related wallet APIs

| Method | Path | Use |
| ------ | ---- | --- |
| POST | `/api/v1/wallet/settle/call/:callLogId` | Retry call settlement |
| POST | `/api/v1/wallet/transfer/user-to-astrologer` | Manual transfer |

---

### Push notification `data.type` values (latest)

| type | When |
| ---- | ---- |
| `chat_request` | New pending session |
| `chat_accepted` | Astrologer accepted |
| `chat_declined` | Astrologer declined |
| `chat_ended` | Session ended |
| `incoming_call` | Voice/video ring (existing) |

