# Alka Bakery API Documentation

This document provides details for frontend developers integrating with the Alka Bakery backend API.

**Base URL:** All API endpoints are relative to your deployed backend URL (e.g., `https://your-backend.vercel.app/api`).

**Authentication:** Most protected routes require a JSON Web Token (JWT) to be sent in the `Authorization` header as a Bearer token.

`Authorization: Bearer <your_access_token>`

Admin-only routes require the authenticated user to have the `is_admin` flag set to true.

---

## 🔑 Authentication

Endpoints for user registration, login, logout, and token refresh.

### Register User

* **Method:** `POST`
* **Path:** `/auth/register`
* **Body (JSON):**
    ```json
    {
      "name": "Test User",
      "email": "test@example.com",
      "password": "password123"
    }
    ```
* **Response (Success 200):**
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
* **Response (Error 500):** Server error during registration or token storage.

### Login User

* **Method:** `POST`
* **Path:** `/auth/login`
* **Body (JSON):**
    ```json
    {
      "email": "test@example.com",
      "password": "password123"
    }
    ```
* **Response (Success 200):**
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
* **Response (Error 401):** "Invalid credentials".
* **Response (Error 500):** Server error.

### Logout User

* **Method:** `POST`
* **Path:** `/auth/logout`
* **Note:** This endpoint primarily clears the refresh token from the database and expects the refresh token in cookies (which might differ from client-side token storage). The frontend should discard both access and refresh tokens upon logout regardless.
* **Response (Success 200/204):** Indicates successful logout or that the user was already logged out.

### Refresh Access Token

* **Method:** `POST`
* **Path:** `/auth/refresh-token`
* **Body (JSON):**
    ```json
    {
      "refreshToken": "your_refresh_token"
    }
    ```
* **Response (Success 200):**
    ```json
    {
      "accessToken": "new_access_token"
    }
    ```
* **Response (Error 401):** Refresh token missing in body.
* **Response (Error 403):** Invalid or expired refresh token.

### Get Current User Profile (`/me` alias)

* **Method:** `GET`
* **Path:** `/auth/me`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Response (Success 200):**
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

---

## 👤 User Profile

Endpoints for managing the logged-in user's profile information.

### Get User Profile

* **Method:** `GET`
* **Path:** `/profile`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Response (Success 200):**
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
* **Response (Error 404):** User profile not found.
* **Response (Error 500):** Server error.

### Update User Profile

* **Method:** `PUT`
* **Path:** `/profile`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Body (JSON):**
    ```json
    {
      "name": "Updated Name"
      // Add other fields allowed for update here (e.g., address, phone if implemented)
    }
    ```
* **Response (Success 200):**
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
* **Response (Error 404):** User profile not found.
* **Response (Error 500):** Server error.

---

## 🍰 Products

Endpoints for managing bakery products.

### Add Product (Admin Only)

* **Method:** `POST`
* **Path:** `/products`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Body (Multipart/Form-Data):**
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
* **Response (Success 201):**
    ```json
    {
      "message": "Product added",
      "product": { /* Product object with variants */ }
    }
    ```
* **Response (Error 400):** Missing required fields (name, price, category\_id, variants).
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error during insert or image upload.

### Get All Products

* **Method:** `GET`
* **Path:** `/products`
* **Response (Success 200):** Array of product objects. Only `is_published: true` products are returned. Each product includes:
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

### Get Single Product

* **Method:** `GET`
* **Path:** `/products/:id`
* **Response (Success 200):** Single product object, including:
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

### Update Product Core Details (Admin Only)

* **Method:** `PUT`
* **Path:** `/products/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Body (Multipart/Form-Data):** Same fields as Add Product, **excluding** `variants`. Use this to update name, price, description, flags, tags, main image, etc. **Variant updates require separate endpoints (not yet implemented).**
* **Response (Success 200):**
    ```json
    {
      "message": "Product core details updated",
      "product": { /* Updated product object, without variants */ }
    }
    ```
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.

### Delete Product (Admin Only)

* **Method:** `DELETE`
* **Path:** `/products/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Response (Success 200):**
    ```json
    { "message": "Product deleted successfully" }
    ```
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.

---

## 🏷️ Categories

Endpoints for managing product categories.

### Create Category (Admin Only)

* **Method:** `POST`
* **Path:** `/categories`
* **Headers:** `Authorization: Bearer <admin_access_token>`
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

### Get All Categories

* **Method:** `GET`
* **Path:** `/categories`
* **Response (Success 200):** Array of category objects.
* **Response (Error 500):** Server error.

### Get Single Category

* **Method:** `GET`
* **Path:** `/categories/:id`
* **Response (Success 200):** Single category object.
* **Response (Error 404):** Category not found.
* **Response (Error 500):** Server error.

### Update Category (Admin Only)

* **Method:** `PUT`
* **Path:** `/categories/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
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

### Delete Category (Admin Only)

* **Method:** `DELETE`
* **Path:** `/categories/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Response (Success 200):** `{ "message": "Category deleted successfully" }`
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 404):** Category not found.
* **Response (Error 500):** Server error.

---

## ⚖️ Units

Endpoints for managing measurement units (e.g., Kg, pcs, gram).

### Create Unit (Admin Only)

* **Method:** `POST`
* **Path:** `/units`
* **Headers:** `Authorization: Bearer <admin_access_token>`
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

### Get All Units

* **Method:** `GET`
* **Path:** `/units`
* **Response (Success 200):** Array of unit objects.
* **Response (Error 500):** Server error.

### Get Single Unit

* **Method:** `GET`
* **Path:** `/units/:id`
* **Response (Success 200):** Single unit object.
* **Response (Error 404):** Unit not found.
* **Response (Error 500):** Server error.

### Update Unit (Admin Only)

* **Method:** `PUT`
* **Path:** `/units/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
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

### Delete Unit (Admin Only)

* **Method:** `DELETE`
* **Path:** `/units/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Response (Success 200):** `{ "message": "Unit deleted successfully" }`
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.

---

## 🛒 Orders

Endpoints for placing and viewing orders. (Cash on Delivery only)

### Place Order

* **Method:** `POST`
* **Path:** `/orders`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Body (JSON):**
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
* **Response (Success 201):**
    ```json
    {
      "message": "Order placed successfully",
      "order": { /* Order object */ }
    }
    ```
* **Response (Error 400):** Missing required fields.
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error.

### Get User Orders

* **Method:** `GET`
* **Path:** `/orders/user`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Response (Success 200):** Array of order objects placed by the user.
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error.

### Get All Orders (Admin Only)

* **Method:** `GET`
* **Path:** `/orders/admin`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Response (Success 200):** Array of all order objects, including user details (`users: { name, email }`).
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.

### Update Order Status (Admin Only)

* **Method:** `PUT`
* **Path:** `/orders/:id`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Body (JSON):**
    ```json
    {
      "status": "Shipped" // e.g., "Pending", "Processing", "Shipped", "Delivered", "Cancelled"
    }
    ```
* **Response (Success 200):**
    ```json
    {
      "message": "Order status updated",
      "order": { /* Updated order object */ }
    }
    ```
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.

---

## ⭐ Reviews

Endpoints for managing product reviews.

### Add Review

* **Method:** `POST`
* **Path:** `/reviews/:productId`
* **Headers:** `Authorization: Bearer <your_access_token>`
* **Body (JSON):**
    ```json
    {
      "rating": 5, // Integer between 1 and 5
      "comment": "This cake was delicious!" // Optional
    }
    ```
* **Response (Success 201):**
    ```json
    {
      "message": "Review submitted successfully. It will be visible after approval.",
      "review": { /* Review object, is_approved: false */ }
    }
    ```
* **Response (Error 400):** Invalid rating or user already reviewed.
* **Response (Error 401):** Not authenticated.
* **Response (Error 500):** Server error.

### Get Approved Reviews for Product

* **Method:** `GET`
* **Path:** `/reviews/:productId`
* **Response (Success 200):** Array of approved review objects (`id, user_name, rating, comment, created_at`).
* **Response (Error 500):** Server error.

### Get All Reviews (Admin Only)

* **Method:** `GET`
* **Path:** `/reviews/admin/all`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Response (Success 200):** Array of all review objects, including `is_approved` status and product name (`products: { name }`).
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.

### Approve Review (Admin Only)

* **Method:** `PUT`
* **Path:** `/reviews/admin/approve/:reviewId`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Response (Success 200):**
    ```json
    {
      "message": "Review approved",
      "review": { /* Updated review object, is_approved: true */ }
    }
    ```
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 404):** Review not found.
* **Response (Error 500):** Server error.

### Delete Review (Admin Only)

* **Method:** `DELETE`
* **Path:** `/reviews/admin/:reviewId`
* **Headers:** `Authorization: Bearer <admin_access_token>`
* **Response (Success 200):** `{ "message": "Review deleted" }`
* **Response (Error 401/403):** Not authenticated or not an admin.
* **Response (Error 500):** Server error.

---

## ✉️ Contact Form

Endpoint for submitting contact inquiries.

### Send Contact Message

* **Method:** `POST`
* **Path:** `/contact`
* **Body (JSON):**
    ```json
    {
      "name": "Customer Name",
      "email": "customer@email.com",
      "message": "Inquiry text here."
    }
    ```
* **Response (Success 200):**
    ```json
    {
      "message": "Your message has been sent successfully!",
      "contact": { /* Saved contact object */ }
    }
    ```
* **Response (Error 400):** Missing required fields.
* **Response (Error 500):** Server error or failed to send email.

---
