# Frontend
Send a request to backend endpoint to verify and store user in database


# Backend
When an authenticated user calls your backend:

Verify the Clerk token.
Read the Clerk user ID from the verified token.
Find the user by clerkUserId.
Create the local record if it does not exist.

