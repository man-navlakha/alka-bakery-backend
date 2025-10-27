import { supabase } from "../config/supabase.js";
import cloudinary from "../config/cloudinary.js";

// 🥐 Add Product
export const addProduct = async (req, res) => {
  try {
    const { 
      name, description, price, category_id,
      is_published, is_available, is_featured, 
      sale_price, on_sale, preparation_time, shelf_life,
      is_customizable, is_gift_wrappable, gift_wrap_price, 
      personalization_message_limit, tags,
      variants // Expect variants as an array in the body
    } = req.body;
            
    if (!name || !price || !category_id) {
      return res.status(400).json({ message: "Name, base price, and category ID are required" });
    }
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ message: "At least one product variant is required" });
    }

    // Handle Main Image (still recommended for category pages, etc.)
    let mainImageUrl = null;
    if (req.files && req.files.image) {
      const file = req.files.image;
      const uploadResult = await cloudinary.uploader.upload(file.tempFilePath, { folder: "alka-bakery" });
      mainImageUrl = uploadResult.secure_url;
    }

    // --- Insert the main product ---
    const { data: newProduct, error: productError } = await supabase
      .from("products")
      .insert([{ 
        name, description, price, category_id,
        image: mainImageUrl, 
        is_published, is_available, is_featured, 
        sale_price, on_sale, preparation_time, shelf_life,
        is_customizable, is_gift_wrappable, gift_wrap_price, 
        personalization_message_limit, tags 
      }])
      .select('id') // Only select the ID we need
      .single();

    if (productError) throw productError;
    const newProductId = newProduct.id;

    // --- Prepare and Insert Variants ---
    const variantObjects = variants.map(variant => ({
      product_id: newProductId,
      name: variant.name,
      price_modifier: variant.price_modifier || 0,
      sku: variant.sku,
      is_available: variant.is_available,
      min_quantity: variant.min_quantity,
      max_quantity: variant.max_quantity,
      quantity_step: variant.quantity_step,
      unit_id: variant.unit_id // Add unit_id to variant
    }));

    const { error: variantsError } = await supabase
      .from("product_variants")
      .insert(variantObjects);

    if (variantsError) {
      // If variants fail, maybe delete the product? Or handle differently.
      console.error("Error inserting variants:", variantsError);
      // Rollback: Delete the product if variants failed
      await supabase.from('products').delete().eq('id', newProductId); 
      throw new Error("Failed to save product variants.");
    }

    // --- Handle Gallery Images (Optional - remains the same) ---
    if (req.files && req.files.images) {
      const galleryFiles = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      const galleryImageObjects = [];
      for (const file of galleryFiles) {
        const uploadResult = await cloudinary.uploader.upload(file.tempFilePath, { folder: "alka-bakery-gallery" });
        galleryImageObjects.push({ product_id: newProductId, image_url: uploadResult.secure_url });
      }
      if (galleryImageObjects.length > 0) {
        const { error: imagesError } = await supabase.from("product_images").insert(galleryImageObjects);
        if (imagesError) console.error("Error saving gallery images:", imagesError); // Log error but don't fail the request
      }
    }

    // Fetch the newly created product with its variants to return
    const { data: finalProduct, error: fetchError } = await supabase
        .from('products')
        .select(`*, product_variants(*)`)
        .eq('id', newProductId)
        .single();
    
    if(fetchError) throw fetchError;

    res.status(201).json({ message: "Product added", product: finalProduct });

  } catch (error) {
    console.error("Add Product Error:", error);
    res.status(500).json({ message: error.message });
  }
};export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, description, price, category_id,
      is_published, is_available, is_featured, 
      sale_price, on_sale, preparation_time, shelf_life,
      is_customizable, is_gift_wrappable, gift_wrap_price, 
      personalization_message_limit, tags 
    } = req.body;

    let updateData = { 
      name, description, price, category_id,
      is_published, is_available, is_featured, 
      sale_price, on_sale, preparation_time, shelf_life,
      is_customizable, is_gift_wrappable, gift_wrap_price, 
      personalization_message_limit, tags 
    };

    // Handle updating the main image
    if (req.files && req.files.image) {
      const file = req.files.image;
      const uploadResult = await cloudinary.uploader.upload(file.tempFilePath, { folder: "alka-bakery" });
      updateData.image = uploadResult.secure_url;
    }

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Product core details updated", product: data });
  } catch (error) {
     console.error("Update Product Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Delete Product (Admin)
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// 🍰 Get All Products
export const getProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        categories ( name ),
        product_variants ( * ), 
        product_images ( id, image_url ),
        product_reviews ( count ) 
      `)
      // .eq('product_reviews.is_approved', true) // Filter reviews - better done separately
      .eq('is_published', true) // Only get published products
      .order("created_at", { ascending: false });

    if (error) throw error;

    // TODO: Calculate average rating if needed (requires fetching reviews separately or a DB function)
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🎂 Get Single Product
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        categories ( name ),
        product_variants ( *, units ( name ) ),  -- Fetch unit name for variants
        product_images ( id, image_url ),
        product_reviews ( * ) 
      `)
      .eq("id", id)
      // .eq('product_reviews.is_approved', true) // Filter reviews
      .single();

    if (error) {
        console.error("Get Product By ID Error:", error);
        return res.status(404).json({ message: "Product not found" });
    }

    // TODO: Calculate average rating here
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};