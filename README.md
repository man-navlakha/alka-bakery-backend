# Alka Bakery API Documentation (Complete)

This document provides comprehensive information for frontend developers integrating with the Alka Bakery backend API.

**Base URL:** All API endpoints are relative to your deployed backend URL (e.g., `https://your-backend.vercel.app/api`).

---

## 🔄 General Workflow & Authentication

1.  **Registration/Login:** Users register (`/auth/register`) or log in (`/auth/login`).
2.  **Token Storage:** Upon successful login/registration, the API returns an `accessToken` and a `refreshToken`. The frontend should store these securely (e.g., `accessToken` in memory, `refreshToken` in HttpOnly cookie or secure local storage).
3.  **Authenticated Requests:** For protected routes, the frontend must include the `accessToken` in the `Authorization` header:
    `Authorization: Bearer <your_access_token>`
4.  **Token Expiration:** Access tokens are short-lived (15 minutes). If a request fails with a 401 (Unauthorized/Invalid Token), the frontend should attempt to get a new `accessToken` using the `/auth/refresh-token` endpoint with the stored `refreshToken`.
5.  **Refresh Token Expiration:** Refresh tokens are longer-lived (7 days). If refreshing fails (401/403), the user must log in again.
6.  **Admin Access:** Certain routes (marked "Admin Only") require the logged-in user to have the `is_admin` flag set to `true` in the database. The `adminCheck` middleware enforces this.

---

## 🔑 Authentication (`/auth`)

Endpoints for user registration, login, logout, and token management.

### Register User

* **Method:** `POST`
* **Path:** `/auth/register`
* **Description:** Creates a new user account.
* **Body (JSON):**
    ```json
    {
      "name": "Test User",
      "email": "test@example.com",
      "password": "password123" // Min 6 characters
    }
    ```
* **Validation:** Uses `express-validator` for name (required), email (valid format), and password (min length).
* **Response (Success 200):** Returns user info, access token, and refresh token.
    ```json
    {
      "message": "Login successful", // Note: Message might be slightly inaccurate
      "user": { "id": "uuid", "name": "Test User", "email": "test@example.com", "role": null },
      "accessToken": "...",
      "refreshToken": "..."
    }
    ```
    Alternative response structure:
    ```json
    {
      "message": "Registration successful", // Note: The controller code actually sends "Login successful" here
      "user": {
        "id": "user-uuid",
        "name": "Test User",
        "email": "test@example.com",
        "role": null // Or 'admin'
      },
      "accessToken": "your_access_token",
      "refreshToken": "your_refresh_token"
    }
    ```
* **Response (Error 400):** Validation errors or "User already exists".
* **Response (Error 500):** Server error during user creation, registration or token storage.
* **Flow:**
    1.  Frontend sends user details.
    2.  Backend validates input.
    3.  Backend checks if email already exists in Supabase `users` table.
    4.  Backend hashes the password.
    5.  Backend inserts the new user record.
    6.  Backend generates JWT access and refresh tokens.
    7.  Backend updates the user record with the refresh token.
    8.  Backend sends user details and tokens back to the frontend.

### Login User

* **Method:** `POST`
* **Path:** `/auth/login`
* **Description:** Authenticates a user and returns tokens.
* **Body (JSON):**
    ```json
    {
      "email": "test@example.com",
      "password": "password123"
    }
    ```
* **Validation:** Uses `express-validator` for email (valid format) and password (required).
* **Response (Success 200):** Returns user info, access token, and refresh token.
    ```json
    {
      "message": "Login successful",
      "user": { "id": "uuid", "name": "Test User", "email": "test@example.com", "role": null /* or 'admin' */ },
      "accessToken": "...",
      "refreshToken": "..."
    }
    ```
    Alternative response structure:
    ```json
    {
      "message": "Login successful",
      "user": {
        "id": "user-uuid",
        "name": "Test User",
        "email": "test@example.com",
        "role": null // Or 'admin'
      },
      "accessToken": "your_access_token",
      "refreshToken": "your_refresh_token"
    }
    ```
* **Response (Error 400):** Validation errors.
* **Response (Error 401):** "Invalid credentials" (user not found or password mismatch).
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends credentials.
    2.  Backend validates input.
    3.  Backend fetches user record by email from Supabase `users`.
    4.  Backend compares provided password with the stored hash using `bcrypt.compare`.
    5.  If match, backend generates new JWT access and refresh tokens.
    6.  Backend updates the user record with the new refresh token.
    7.  Backend sends user details and tokens back to the frontend.

### Logout User

* **Method:** `POST`
* **Path:** `/auth/logout`
* **Description:** Invalidates the user's refresh token in the database. Frontend must discard stored tokens.
* **Note:** Assumes refresh token is in an `HttpOnly` cookie named `refreshToken`. This endpoint primarily clears the refresh token from the database and expects the refresh token in cookies (which might differ from client-side token storage). The frontend should discard both access and refresh tokens upon logout regardless.
* **Response (Success 200/204):** Indicates successful logout or user was already logged out.
* **Flow:**
    1.  Frontend sends request (no body needed if using cookies).
    2.  Backend reads `refreshToken` from cookies.
    3.  Backend verifies the token to get the user ID.
    4.  Backend updates the user record in Supabase `users`, setting `refresh_token` to `null`.
    5.  Backend attempts to clear the `refreshToken` cookie.
    6.  Backend sends success response.

### Refresh Access Token

* **Method:** `POST`
* **Path:** `/auth/refresh-token`
* **Description:** Generates a new `accessToken` using a valid `refreshToken`.
* **Body (JSON):**
    ```json
    {
      "refreshToken": "your_valid_refresh_token"
    }
    ```
* **Response (Success 200):**
    ```json
    {
      "accessToken": "new_access_token"
    }
    ```
* **Response (Error 401):** Refresh token missing in the request body.
* **Response (Error 403):** Refresh token is invalid, expired, or doesn't match the database record.
* **Flow:**
    1.  Frontend sends `refreshToken` in request body.
    2.  Backend verifies the token signature and expiry.
    3.  Backend fetches the user record matching the ID from the token.
    4.  Backend compares the provided token with the `refresh_token` stored in the database.
    5.  If valid and matches, backend generates a new `accessToken`.
    6.  Backend sends the new `accessToken` back to the frontend.

### Get Current User Profile (`/me`)

* **Method:** `GET`
* **Path:** `/auth/me`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Retrieves profile information for the currently authenticated user.
* **Response (Success 200):**
    ```json
    {
        "user": {
            "id": "uuid",
            "name": "Current User",
            "email": "user@example.com",
            "created_at": "timestamp",
            "role": null /* or 'admin' */
        }
    }
    ```
    Alternative response structure:
    ```json
    {
        "user": {
            "id": "user-uuid",
            "name": "Test User",
            "email": "test@example.com",
            "created_at": "timestamp",
            "role": null // Or 'admin'
        }
    }
    ```
* **Response (Error 401):** Token missing or invalid.
* **Response (Error 500):** Server error.
* **Note:** See also `/api/profile` which provides the same functionality.
* **Flow:**
    1.  Frontend sends request with `accessToken`.
    2.  `protect` middleware verifies token, extracts user ID (`req.user`).
    3.  Backend fetches user details (excluding sensitive fields) from Supabase `users` table using `req.user`.
    4.  Backend sends user details back.

---

## 👤 User Profile (`/profile`)

Endpoints specifically for managing the logged-in user's own profile.

### Get User Profile

* **Method:** `GET`
* **Path:** `/profile`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Retrieves profile information for the currently authenticated user (identical to `/auth/me`).
* **Response (Success 200):**
    ```json
    {
        "user": { /* Same structure as /auth/me */ }
    }
    ```
    Alternative response structure:
    ```json
    {
        "user": {
            "id": "user-uuid",
            "name": "Test User",
            "email": "test@example.com",
            "created_at": "timestamp",
            "role": null // Or 'admin'
        }
    }
    ```
* **Response (Error 401):** Token missing or invalid.
* **Response (Error 404):** User not found or User profile not found.
* **Response (Error 500):** Server error.
* **Flow:** (Identical to `/auth/me` flow)

### Update User Profile

* **Method:** `PUT`
* **Path:** `/profile`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Updates the name (and potentially other fields) of the logged-in user.
* **Body (JSON):**
    ```json
    {
      "name": "Updated Name"
      // Add other updatable fields here
    }
    ```
    Alternative body structure:
    ```json
    {
      "name": "Updated Name"
      // Add other fields allowed for update here (e.g., address, phone if implemented)
    }
    ```
* **Validation:** Name is required. `express-validator` trims and escapes the name.
* **Response (Success 200):**
    ```json
    {
      "message": "Profile updated successfully",
      "user": { /* Updated user object */ }
    }
    ```
    Alternative response structure:
    ```json
    {
      "message": "Profile updated successfully",
      "user": {
            "id": "user-uuid",
            "name": "Updated Name",
            "email": "test@example.com",
            "created_at": "timestamp",
            "role": null // Or 'admin'
      }
    }
    ```
* **Response (Error 400):** Validation errors (e.g., name missing).
* **Response (Error 401):** Token missing or invalid.
* **Response (Error 404):** User not found or User profile not found.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with `accessToken` and updated data.
    2.  `protect` middleware verifies token, gets user ID (`req.user`).
    3.  Backend validates input data.
    4.  Backend updates the user record in Supabase `users` table using `req.user`.
    5.  Backend fetches the updated user details (excluding sensitive fields).
    6.  Backend sends success message and updated user details back.

---

## 🍰 Products (`/products`)

Endpoints for viewing and managing bakery products and their variations.

### Add Product (Admin Only)

* **Method:** `POST`
* **Path:** `/products`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Creates a new product, its variations, and uploads images.
* **Body (Multipart/Form-Data):** Contains core product fields, JSON string for `variants`, and optional `image` (main) and `images` (gallery) files.
    * `name` (text)
    * `description` (text)
    * `price` (number - base price)
    * `category_id` (UUID)
    * `is_published` (boolean, optional, default: true)
    * `is_available` (boolean, optional, default: true)
    * `is_featured` (boolean, optional, default: false)
    * `sale_price` (number, optional)
    * `on_sale` (boolean, optional, default: false)
    * `preparation_time` (text, optional, default: "24 hours")
    * `shelf_life` (text, optional)
    * `is_customizable` (boolean, optional, default: false)
    * `is_gift_wrappable` (boolean, optional, default: false)
    * `gift_wrap_price` (number, optional, default: 0)
    * `personalization_message_limit` (integer, optional, default: 0)
    * `tags` (array of text, optional, e.g., `tags=birthday&tags=chocolate`)
    * `variants` (JSON stringified array of variant objects):
        ```json
        [
          {
            "name": "0.5 Kg",
            "price_modifier": 0,
            "sku": "CAKE-CHOC-05",
            "is_available": true,
            "min_quantity": 1,
            "max_quantity": 5,
            "quantity_step": 1,
            "unit_id": 1 // ID from the units table
          },
          {
            "name": "1 Kg",
            "price_modifier": 400,
             "sku": "CAKE-CHOC-10",
            "is_available": true,
            "min_quantity": 1,
            "max_quantity": 3,
            "quantity_step": 1,
            "unit_id": 1
          }
        ]
        ```
    * `image` (file, optional): The main product image.
    * `images` (file(s), optional): Gallery images (can upload multiple with the same name).
* **Response (Success 201):** Product object including nested variants.
    ```json
    {
      "message": "Product added",
      "product": { /* Product object with variants */ }
    }
    ```
* **Response (Error 400):** Missing required fields or invalid variants data. Missing required fields (name, price, category\_id, variants).
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error. Server error during insert or image upload.
* **Flow:**
    1.  Admin frontend sends product data, variant JSON, and image files.
    2.  `protect` and `adminCheck` middleware verify admin user.
    3.  Backend uploads main `image` to Cloudinary (if present).
    4.  Backend inserts core product details into Supabase `products` table.
    5.  Backend parses `variants` JSON, maps each variant to the new product ID.
    6.  Backend inserts all variant objects into Supabase `product_variants` table. (Rollback: If this fails, delete the core product).
    7.  Backend uploads gallery `images` to Cloudinary and inserts records into `product_images` (if present).
    8.  Backend fetches the complete product data (including variants) just created.
    9.  Backend sends the complete product data back.

### Get All Products

* **Method:** `GET`
* **Path:** `/products`
* **Description:** Retrieves a list of all *published* products.
* **Response (Success 200):** Array of product objects, including nested `categories`, `product_variants`, `product_images`, and `product_reviews` count. Only `is_published: true` products are returned. Each product includes:
    * All fields from the `products` table.
    * `categories: { name: "Category Name" }`
    * `product_variants: [ { /* variant object */ } ]`
    * `product_images: [ { id, image_url } ]`
    * `product_reviews: { count: number }` (Count of approved reviews)
    ```json
    [
      {
        "id": "prod-uuid",
        "name": "Chocolate Cake",
        "price": 500,
        "image": "main_image_url",
        // ... other product fields
        "categories": { "name": "Cakes" },
        "product_variants": [ /* array of variant objects */ ],
        "product_images": [ /* array of image objects */ ],
        "product_reviews": { "count": 5 }
      },
      // ... more products
    ]
    ```
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request.
    2.  Backend queries Supabase `products` table.
    3.  Query filters for `is_published = true`.
    4.  Query uses Supabase joins to fetch related category name, all variants, all images, and a count of reviews for each product.
    5.  Backend sends the array of product objects back.

### Get Single Product

* **Method:** `GET`
* **Path:** `/products/:id`
* **Description:** Retrieves detailed info for one product.
* **Response (Success 200):** Single product object including nested `categories`, `product_variants` (with `units`), `product_images`, and all `product_reviews`.
    * All fields from the `products` table.
    * `categories: { name: "Category Name" }`
    * `product_variants: [ { /* variant object including units: { name: "Unit Name" } */ } ]`
    * `product_images: [ { id, image_url } ]`
    * `product_reviews: [ { /* full review object */ } ]` (Can be filtered for approved reviews on the frontend or backend)
    ```json
      {
        "id": "prod-uuid",
        "name": "Chocolate Cake",
        "price": 500,
        "image": "main_image_url",
        // ... other product fields
        "categories": { "name": "Cakes" },
        "product_variants": [ 
            { 
                "id": "variant-uuid", 
                "name": "1 Kg", 
                // ... other variant fields
                "units": { "name": "Kg"} 
            } 
        ],
        "product_images": [ /* array of image objects */ ],
        "product_reviews": [ /* array of full review objects */ ]
      }
    ```
* **Response (Error 404):** Product not found.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with product ID.
    2.  Backend queries Supabase `products` table for the specific ID.
    3.  Query uses Supabase joins to fetch related category name, all variants (including their unit names), all images, and all reviews associated with that product.
    4.  Backend sends the single complete product object back.

### Update Product Core Details (Admin Only)

* **Method:** `PUT`
* **Path:** `/products/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Updates the main fields of the `products` table. **Does not update variants.** Same fields as Add Product, **excluding** `variants`. Use this to update name, price, description, flags, tags, main image, etc. **Variant updates require separate endpoints (not yet implemented).**
* **Body (Multipart/Form-Data):** Updated core product data, potentially including a new `image` file.
* **Response (Success 200):** Updated core product object.
    ```json
    {
      "message": "Product core details updated",
      "product": { /* Updated product object, without variants */ }
    }
    ```
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Admin frontend sends updated product data and optional image.
    2.  `protect` and `adminCheck` middleware verify admin user.
    3.  Backend uploads new main `image` to Cloudinary (if present).
    4.  Backend updates the record in the Supabase `products` table matching the ID.
    5.  Backend sends the updated core product data back.

### Delete Product (Admin Only)

* **Method:** `DELETE`
* **Path:** `/products/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Deletes a product and cascades to delete related variants, images, and reviews.
* **Response (Success 200):** Success message.
    ```json
    { "message": "Product deleted successfully" }
    ```
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Admin frontend sends delete request with product ID.
    2.  `protect` and `adminCheck` middleware verify admin user.
    3.  Backend issues a delete command to the Supabase `products` table for the given ID.
    4.  Supabase database automatically deletes related rows in `product_variants`, `product_images`, and `product_reviews` due to `ON DELETE CASCADE`.
    5.  Backend sends a success message back.

---

## ⭐ Reviews (`/reviews`)

Endpoints for managing product reviews.

### Add Review

* **Method:** `POST`
* **Path:** `/reviews/:productId`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Allows a logged-in user to submit a review (starts unapproved).
* **Body (JSON):** `{ "rating": 1-5, "comment": "Optional text" }`
    ```json
    {
      "rating": 5, // Integer between 1 and 5
      "comment": "This cake was delicious!" // Optional
    }
    ```
* **Response (Success 201):** Message and the new review object (`is_approved: false`).
    ```json
    {
      "message": "Review submitted successfully. It will be visible after approval.",
      "review": { /* Review object, is_approved: false */ }
    }
    ```
* **Response (Error 400):** Invalid rating or already reviewed. Invalid rating or user already reviewed.
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends review data and `accessToken`.
    2.  `protect` middleware verifies user.
    3.  Backend validates rating.
    4.  Backend checks `product_reviews` if `user_id` already reviewed this `productId`.
    5.  Backend fetches user's name from `users` table.
    6.  Backend inserts review into `product_reviews` with `is_approved = false`.
    7.  Backend sends success message and the new review object.

### Get Approved Reviews for Product

* **Method:** `GET`
* **Path:** `/reviews/:productId`
* **Description:** Retrieves *approved* reviews for a product.
* **Response (Success 200):** Array of review objects (`id, user_name, rating, comment, created_at`). Array of approved review objects (`id, user_name, rating, comment, created_at`).
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with product ID.
    2.  Backend queries `product_reviews` table for `productId`.
    3.  Query filters for `is_approved = true`.
    4.  Backend selects specific public fields and sends the array back.

### Get All Reviews (Admin Only)

* **Method:** `GET`
* **Path:** `/reviews/admin/all`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Retrieves all reviews for moderation.
* **Response (Success 200):** Array of full review objects including product name. Array of all review objects, including `is_approved` status and product name (`products: { name }`).
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Admin frontend sends request with token.
    2.  `protect` and `adminCheck` middleware verify admin user.
    3.  Backend queries `product_reviews` table, joining `products` table to get product name.
    4.  Backend sends the array of all review objects back.

### Approve Review (Admin Only)

* **Method:** `PUT`
* **Path:** `/reviews/admin/approve/:reviewId`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Marks a review as approved.
* **Response (Success 200):** Message and updated review object.
    ```json
    {
      "message": "Review approved",
      "review": { /* Updated review object, is_approved: true */ }
    }
    ```
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 404):** Review not found.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Admin frontend sends request with review ID and token.
    2.  `protect` and `adminCheck` middleware verify admin user.
    3.  Backend updates the `product_reviews` record matching `reviewId`, setting `is_approved = true`.
    4.  Backend sends success message and the updated review object.

### Delete Review (Admin Only)

* **Method:** `DELETE`
* **Path:** `/reviews/admin/:reviewId`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Deletes a review.
* **Response (Success 200):** Success message. `{ "message": "Review deleted" }`
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Admin frontend sends request with review ID and token.
    2.  `protect` and `adminCheck` middleware verify admin user.
    3.  Backend deletes the `product_reviews` record matching `reviewId`.
    4.  Backend sends success message.

---

## 🏷️ Categories (`/categories`)

Endpoints for managing product categories.

### Create Category (Admin Only)

* **Method:** `POST`
* **Path:** `/categories`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Creates a new category.
* **Body (JSON):**
    ```json
    {
      "name": "New Category",
      "description": "Optional description"
    }
    ```
* **Response (Success 201):** Category object.
* **Response (Error 400):** Name required or category already exists.
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:** Admin sends name/description -> Backend validates -> Backend inserts -> Backend returns new item.

### Get All Categories

* **Method:** `GET`
* **Path:** `/categories`
* **Description:** Retrieves all categories.
* **Response (Success 200):** Array of category objects.
* **Response (Error 500):** Server error.
* **Flow:** Frontend sends request -> Backend fetches all items -> Backend returns array.

### Get Single Category

* **Method:** `GET`
* **Path:** `/categories/:id`
* **Description:** Retrieves a single category by ID.
* **Response (Success 200):** Single category object.
* **Response (Error 404):** Category not found.
* **Response (Error 500):** Server error.
* **Flow:** Frontend sends request with ID -> Backend fetches item by ID -> Backend returns item or 404.

### Update Category (Admin Only)

* **Method:** `PUT`
* **Path:** `/categories/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Updates an existing category.
* **Body (JSON):**
    ```json
    {
      "name": "Updated Name",
      "description": "Updated description"
    }
    ```
* **Response (Success 200):** Updated category object.
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 404):** Category not found.
* **Response (Error 500):** Server error.
* **Flow:** Admin sends updated name/description -> Backend validates -> Backend updates item by ID -> Backend returns updated item.

### Delete Category (Admin Only)

* **Method:** `DELETE`
* **Path:** `/categories/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Deletes a category.
* **Response (Success 200):** `{ "message": "Category deleted successfully" }`
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 404):** Category not found.
* **Response (Error 500):** Server error.
* **Flow:** Admin sends request with ID -> Backend deletes item by ID -> Backend returns success message.

---

## ⚖️ Units (`/units`)

Endpoints for managing measurement units (e.g., Kg, pcs, gram).

### Create Unit (Admin Only)

* **Method:** `POST`
* **Path:** `/units`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Creates a new unit.
* **Body (JSON):**
    ```json
    {
      "name": "Kg",
      "description": "Kilogram"
    }
    ```
* **Response (Success 201):** Unit object.
* **Response (Error 400):** Name required or unit already exists.
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:** Admin sends name/description -> Backend validates -> Backend inserts -> Backend returns new item.

### Get All Units

* **Method:** `GET`
* **Path:** `/units`
* **Description:** Retrieves all units.
* **Response (Success 200):** Array of unit objects.
* **Response (Error 500):** Server error.
* **Flow:** Frontend sends request -> Backend fetches all items -> Backend returns array.

### Get Single Unit

* **Method:** `GET`
* **Path:** `/units/:id`
* **Description:** Retrieves a single unit by ID.
* **Response (Success 200):** Single unit object.
* **Response (Error 404):** Unit not found.
* **Response (Error 500):** Server error.
* **Flow:** Frontend sends request with ID -> Backend fetches item by ID -> Backend returns item or 404.

### Update Unit (Admin Only)

* **Method:** `PUT`
* **Path:** `/units/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Updates an existing unit.
* **Body (JSON):**
    ```json
    {
      "name": "Kilogram",
      "description": "Updated description"
    }
    ```
* **Response (Success 200):** Updated unit object.
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:** Admin sends updated name/description -> Backend validates -> Backend updates item by ID -> Backend returns updated item.

### Delete Unit (Admin Only)

* **Method:** `DELETE`
* **Path:** `/units/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Deletes a unit.
* **Response (Success 200):** `{ "message": "Unit deleted successfully" }`
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:** Admin sends request with ID -> Backend deletes item by ID -> Backend returns success message.

---

## 🛒 Orders (`/orders`)

Endpoints for placing and viewing orders. (Cash on Delivery only)

### Place Order

* **Method:** `POST`
* **Path:** `/orders`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Submits a new order (Cash on Delivery).
* **Body (JSON):** Contains `products` array, `total`, `address`.
    ```json
    {
      "products": [ // Array of items from the cart
        { 
          "productId": "prod-uuid", 
          "variantId": "variant-uuid", // Important: Identify which variant
          "name": "Chocolate Cake (1 Kg)", 
          "quantity": 1, 
          "price": 900 // Price for this item * quantity at time of order
        } 
      ],
      "total": 900, // Total order amount
      "address": "123 Bakery Lane, Ahmedabad" 
    }
    ```
* **Response (Success 201):** Message and the new order object.
    ```json
    {
      "message": "Order placed successfully",
      "order": { /* Order object */ }
    }
    ```
* **Response (Error 400):** Missing required fields.
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends order details (from checkout state) and `accessToken`.
    2.  `protect` middleware verifies user.
    3.  Backend validates required fields.
    4.  Backend inserts a new record into Supabase `orders` table with user ID, products JSON, total, and address.
    5.  Backend sends success message and the created order object.

### Get User Orders

* **Method:** `GET`
* **Path:** `/orders/user`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Retrieves orders for the logged-in user.
* **Response (Success 200):** Array of order objects.
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with `accessToken`.
    2.  `protect` middleware verifies user.
    3.  Backend queries Supabase `orders` table, filtering by `user_id`.
    4.  Backend sends the array of matching orders.

### Get All Orders (Admin Only)

* **Method:** `GET`
* **Path:** `/orders/admin`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Retrieves all orders for admin view.
* **Response (Success 200):** Array of order objects including user details. Array of all order objects, including user details (`users: { name, email }`).
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Admin frontend sends request with token.
    2.  `protect` and `adminCheck` middleware verify admin user.
    3.  Backend queries Supabase `orders` table, joining `users` table for name/email.
    4.  Backend sends the array of all orders with user info.

### Update Order Status (Admin Only)

* **Method:** `PUT`
* **Path:** `/orders/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Description:** Updates the status of an order.
* **Body (JSON):** `{ "status": "NewStatus" }`
    ```json
    {
      "status": "Shipped" // e.g., "Pending", "Processing", "Shipped", "Delivered", "Cancelled"
    }
    ```
* **Response (Success 200):** Message and updated order object.
    ```json
    {
      "message": "Order status updated",
      "order": { /* Updated order object */ }
    }
    ```
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Admin frontend sends request with order ID, new status, and token.
    2.  `protect` and `adminCheck` middleware verify admin user.
    3.  Backend updates the `status` field in the Supabase `orders` table for the given ID.
    4.  Backend sends success message and the updated order object.

---

## 🛒 Cart (`/api/cart`)

Endpoints for managing the user's shopping cart, including items, coupons, and gift wrapping. **All cart endpoints require authentication.** (`Authorization: Bearer <your_access_token>`).

### Get Cart Details

* **Method:** `GET`
* **Path:** `/`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Retrieves the current state of the user's cart, including items, applied coupon, gift wrap status, and calculated totals. Creates an empty cart if one doesn't exist for the user.
* **Response (Success 200):**
    ```json
    {
      "id": "cart-uuid",
      "user_id": "user-uuid",
      "items": [
        {
          "id": "cart-item-uuid",
          "cart_id": "cart-uuid",
          "product_variant_id": "variant-uuid",
          "quantity": 1,
          "customization_note": "Happy Birthday!", // Null if not applicable/set
          "created_at": "timestamp",
          "updated_at": "timestamp",
          "product_variants": {
            "id": "variant-uuid",
            "product_id": "prod-uuid",
            "name": "1 Kg",
            "price_modifier": 400,
            "sku": "CAKE-CHOC-10",
            "is_available": true,
            "min_quantity": 1,
            "max_quantity": 3,
            "quantity_step": 1,
            "unit_id": 1,
            "created_at": "timestamp",
            "units": { "name": "Kg" },
            "products": {
                "name": "Chocolate Cake",
                "image": "main_image_url",
                "price": 500, // Base price
                "sale_price": null,
                "on_sale": false,
                "is_customizable": true,
                "is_gift_wrappable": true
            }
          }
        }
        // ... more items
      ],
      "is_gift_wrapped": false,
      "subtotal": 900.00,
      "discountAmount": 90.00, // Example if coupon applied
      "giftWrapCost": 0.00,
      "total": 810.00,
      "appliedCoupon": { // Null if no valid coupon applied
          "code": "WELCOME10",
          "description": "10% off first order",
          "value": 10,
          "type": "percentage"
      },
       "requiresGiftWrapOption": true // Indicates if any item allows gift wrap
    }
    ```
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error during cart retrieval or creation.
* **Flow:**
    1.  Frontend sends request with `accessToken`.
    2.  `protect` middleware verifies user.
    3.  Backend attempts to find the user's cart in the `carts` table via `user_id`.
    4.  If no cart exists, backend creates a new entry in `carts` for the user.
    5.  Backend fetches all items from `cart_items` associated with the cart ID.
    6.  Query joins `product_variants`, `units`, and `products` tables to get necessary details (prices, names, rules, images, gift wrap status, customization status).
    7.  If a `applied_coupon_id` exists on the cart, backend fetches coupon details from the `coupons` table.
    8.  Backend calculates subtotal, discount (validating coupon rules like min spend, expiry), gift wrap cost, and total.
    9.  Backend sends the complete cart state including items and calculated totals back.

### Add or Update Item in Cart

* **Method:** `POST`
* **Path:** `/item`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Adds a specified quantity of a product variant to the cart. If the variant already exists, it increases the quantity. Validates against product variant rules (min/max quantity, step, availability) and adds customization note if applicable.
* **Body (JSON):**
    ```json
    {
      "product_variant_id": "variant-uuid",
      "quantity": 1, // Quantity to ADD
      "customization_note": "Optional message" // Only saved if product.is_customizable is true
    }
    ```
* **Response (Success 200 - Updated):**
    ```json
    {
      "message": "Cart item updated",
      "item": { /* Updated cart_item object */ }
    }
    ```
* **Response (Success 201 - Added):**
    ```json
    {
      "message": "Item added to cart",
      "item": { /* New cart_item object */ }
    }
    ```
* **Response (Error 400):** Missing fields, quantity <= 0, variant unavailable, quantity rules violated (min/max/step).
* **Response (Error 401):** Not authenticated.
* **Response (Error 404):** Product Variant not found.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with `accessToken`, variant ID, quantity to add, and optional note.
    2.  `protect` middleware verifies user.
    3.  Backend finds or creates the user's cart.
    4.  Backend fetches the `product_variant` details (including `min/max/step` rules, `is_available`, and `products.is_customizable`) using the provided `product_variant_id`. Returns 404 if not found or 400 if unavailable.
    5.  Backend checks if this `product_variant_id` already exists as an item in the user's `cart_items`.
    6.  Calculate the `newTotalQuantity` (current quantity + quantity to add).
    7.  Backend validates `newTotalQuantity` against the variant's `min_quantity`, `max_quantity`, and `quantity_step`. Returns 400 if invalid.
    8.  Backend determines the `finalNote` (use provided note only if `variant.products.is_customizable` is true, otherwise null).
    9.  If item exists: Backend updates the existing `cart_items` record with the `newTotalQuantity` and `finalNote`.
    10. If item doesn't exist: Backend inserts a new `cart_items` record with the variant ID, `newTotalQuantity`, and `finalNote`.
    11. Backend sends success message and the created/updated `cart_item` object.

### Update Specific Cart Item Details

* **Method:** `PUT`
* **Path:** `/item/:itemId` (e.g., `/api/cart/item/cart-item-uuid`)
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Allows setting the absolute quantity or updating the customization note for a specific item already in the cart. Validates quantity against variant rules.
* **Body (JSON):** (Provide at least one field)
    ```json
    {
      "quantity": 3, // The NEW total quantity for this item
      "customization_note": "New message"
    }
    ```
* **Response (Success 200):**
    ```json
    {
      "message": "Cart item details updated",
      "item": { /* Updated cart_item object */ }
    }
    ```
* **Response (Error 400):** No fields provided, quantity <= 0, quantity rules violated, trying to add note to non-customizable item.
* **Response (Error 401):** Not authenticated.
* **Response (Error 404):** Cart item not found (or doesn't belong to user).
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with `accessToken`, cart item ID, and new quantity and/or note.
    2.  `protect` middleware verifies user.
    3.  Backend finds or creates the user's cart.
    4.  Backend fetches the specific `cart_item` using `itemId`, ensuring it belongs to the user's `cart_id`. Query joins `product_variants` (for rules) and `products` (for `is_customizable`). Returns 404 if not found.
    5.  If `quantity` is provided: Backend validates it against the variant's `min/max/step` rules. Returns 400 if invalid.
    6.  If `customization_note` is provided: Backend checks if `product.is_customizable` is true. Returns 400 if false.
    7.  Backend builds an update payload containing valid changes (quantity, note, `updated_at`).
    8.  Backend updates the `cart_items` record matching `itemId`.
    9.  Backend sends success message and the updated `cart_item` object.

### Remove Item from Cart

* **Method:** `DELETE`
* **Path:** `/item/:itemId`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Removes a specific item from the user's cart.
* **Response (Success 200):**
    ```json
    { "message": "Item removed from cart" }
    ```
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error. (Note: Doesn't explicitly return 404 if item not found, just succeeds silently if no error).
* **Flow:**
    1.  Frontend sends request with `accessToken` and cart item ID.
    2.  `protect` middleware verifies user.
    3.  Backend finds or creates the user's cart.
    4.  Backend deletes the record from `cart_items` matching the `itemId` AND the user's `cart_id`.
    5.  Backend sends success message.

### Apply Coupon to Cart

* **Method:** `POST`
* **Path:** `/coupon`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Applies a coupon code to the user's cart. Validates the code, checks activation status, expiry, and minimum spend requirements based on the current cart subtotal.
* **Body (JSON):**
    ```json
    {
      "code": "WELCOME10"
    }
    ```
* **Response (Success 200):** Returns the full updated cart state (same structure as `GET /api/cart`).
* **Response (Error 400):** Code required, coupon inactive, expired, or minimum spend not met.
* **Response (Error 401):** Not authenticated.
* **Response (Error 404):** Invalid coupon code.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with `accessToken` and coupon code.
    2.  `protect` middleware verifies user.
    3.  Backend finds or creates the user's cart.
    4.  Backend fetches the coupon from the `coupons` table matching the provided code (case-insensitive). Returns 404 if not found.
    5.  Backend checks `coupon.is_active` and `coupon.expiry_date`. Returns 400 if invalid.
    6.  Backend fetches all `cart_items` for the user's cart (joining prices).
    7.  Backend calculates the current `subtotal` using the `calculateCartTotals` helper.
    8.  Backend checks if `subtotal >= coupon.min_spend`. Returns 400 if not met.
    9.  Backend updates the `carts` table, setting `applied_coupon_id` to the found coupon's ID.
    10. Backend calls the `getCart` function internally to fetch the complete, updated cart state (including recalculated totals).
    11. Backend sends the full updated cart state back.

### Remove Coupon from Cart

* **Method:** `DELETE`
* **Path:** `/coupon`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Removes any currently applied coupon from the user's cart.
* **Response (Success 200):** Returns the full updated cart state (same structure as `GET /api/cart`).
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with `accessToken`.
    2.  `protect` middleware verifies user.
    3.  Backend finds or creates the user's cart.
    4.  Backend updates the `carts` table, setting `applied_coupon_id` to `null`.
    5.  Backend calls the `getCart` function internally to fetch the complete, updated cart state (with recalculated totals).
    6.  Backend sends the full updated cart state back.

### Toggle Gift Wrapping for Cart

* **Method:** `PUT`
* **Path:** `/giftwrap`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Description:** Sets the gift wrapping preference for the entire cart.
* **Body (JSON):**
    ```json
    {
      "is_gift_wrapped": true // or false
    }
    ```
* **Response (Success 200):** Returns the full updated cart state (same structure as `GET /api/cart`).
* **Response (Error 400):** `is_gift_wrapped` field is missing or not a boolean.
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error.
* **Flow:**
    1.  Frontend sends request with `accessToken` and the boolean `is_gift_wrapped` value.
    2.  `protect` middleware verifies user.
    3.  Backend validates the input type.
    4.  Backend finds or creates the user's cart.
    5.  Backend updates the `is_gift_wrapped` field in the `carts` table.
    6.  Backend calls the `getCart` function internally to fetch the complete, updated cart state (with recalculated totals reflecting gift wrap cost).
    7.  Backend sends the full updated cart state back.

---

## ✉️ Contact Form (`/contact`)

Endpoint for submitting contact inquiries.

### Send Contact Message

* **Method:** `POST`
* **Path:** `/contact`
* **Description:** Submits a contact form message.
* **Body (JSON):** `{ "name": "...", "email": "...", "message": "..." }`
    ```json
    {
      "name": "Customer Name",
      "email": "customer@email.com",
      "message": "Inquiry text here."
    }
    ```
* **Response (Success 200):** Success message and saved contact object.
    ```json
    {
      "message": "Your message has been sent successfully!",
      "contact": { /* Saved contact object */ }
    }
    ```
* **Response (Error 400):** Missing required fields.
* **Response (Error 500):** Server error or failed to send email. Server error (DB insert or email failure).
* **Flow:**
    1.  Frontend sends contact details.
    2.  Backend validates required fields.
    3.  Backend inserts message details into Supabase `contacts` table.
    4.  Backend uses `nodemailer` to send an email notification to the admin's email address.
    5.  Backend sends success response to the frontend.

---

## 📝 Summary Notes

### Category & Unit Flow
These follow a standard Admin CRUD (Create, Read, Update, Delete) flow:

* **Create (`POST /`)**: Admin sends name/description -> Backend validates -> Backend inserts -> Backend returns new item.
* **Read All (`GET /`)**: Frontend sends request -> Backend fetches all items -> Backend returns array.
* **Read One (`GET /:id`)**: Frontend sends request with ID -> Backend fetches item by ID -> Backend returns item or 404.
* **Update (`PUT /:id`)**: Admin sends updated name/description -> Backend validates -> Backend updates item by ID -> Backend returns updated item.
* **Delete (`DELETE /:id`)**: Admin sends request with ID -> Backend deletes item by ID -> Backend returns success message.

(All Admin operations require `protect` and `adminCheck` middleware).

---

## End of Documentation
