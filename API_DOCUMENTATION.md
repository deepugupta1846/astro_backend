# Astro Backend API Documentation

Base URL (local): `http://localhost:5000`

## Common Notes

- All responses are JSON.
- Success responses usually contain: `success`, optional `message`, and optional `data`.
- Admin APIs require header:
  - `Authorization: Bearer <admin_jwt_token>`
- Path params are shown as `:id`, `:userId`, etc.

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

### POST `/api/v1/user/wallet/create-order`
- Dummy payload:
```json
{
  "userId": 12,
  "amount": 100
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Wallet topup order created",
  "data": {
    "keyId": "rzp_test_xxxxx",
    "orderId": "order_Qwerty123",
    "amount": 100,
    "amountPaise": 10000,
    "currency": "INR",
    "user": {
      "id": 12,
      "phone": "9876543210"
    }
  }
}
```

### POST `/api/v1/user/wallet/verify`
- Dummy payload:
```json
{
  "userId": 12,
  "amount": 100,
  "razorpayOrderId": "order_Qwerty123",
  "razorpayPaymentId": "pay_AbCdEf123",
  "razorpaySignature": "generated_signature_here"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Wallet topup successful",
  "data": {
    "user": {
      "id": 12
    },
    "walletBalance": 450,
    "paymentId": "pay_AbCdEf123",
    "orderId": "order_Qwerty123"
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

## Astrologer APIs

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
- Dummy payload:
```json
{}
```
- Dummy response:
```json
{
  "success": true,
  "data": {
    "id": 77,
    "endedAt": "2026-05-01T04:40:00.000Z",
    "durationSeconds": 600
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
- Dummy payload:
```json
{
  "pujaId": 11,
  "userId": 12,
  "name": "Deepu",
  "phone": "9876543210",
  "preferredDate": "2026-05-15",
  "notes": "Morning slot preferred"
}
```
- Dummy response:
```json
{
  "success": true,
  "message": "Puja booking created",
  "data": {
    "id": 5,
    "pujaId": 11,
    "amount": "2100.00",
    "status": "pending"
  }
}
```

