import { supabase } from "../config/supabase.js";

/**
 * @desc    Add a product review
 * @route   POST /api/reviews/:productId
 * @access  Private (User must be logged in)
 */
export const addReview = async (req, res) => {
    const { rating, comment } = req.body;
    const productId = req.params.productId;
    const userId = req.user; // From protect middleware

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    try {
        // Optional: Check if the user has ordered this product before allowing a review
        // (Requires joining orders table - more complex)

        // Check if user already reviewed this product
        const { data: existingReview, error: existingError } = await supabase
            .from('product_reviews')
            .select('id')
            .eq('product_id', productId)
            .eq('user_id', userId)
            .maybeSingle();

        if (existingError) throw existingError;
        if (existingReview) {
            return res.status(400).json({ message: "You have already reviewed this product." });
        }
        
        // Fetch user name to store with review
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('name')
            .eq('id', userId)
            .single();

        if (userError || !user) throw new Error("Could not find user details.");


        // Insert the review (starts as not approved)
        const { data: newReview, error: insertError } = await supabase
            .from('product_reviews')
            .insert({
                product_id: productId,
                user_id: userId,
                user_name: user.name, // Store user name
                rating,
                comment,
                is_approved: false // Admin needs to approve
            })
            .select()
            .single();

        if (insertError) throw insertError;

        res.status(201).json({ message: "Review submitted successfully. It will be visible after approval.", review: newReview });

    } catch (error) {
        console.error("Add Review Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Get approved reviews for a product
 * @route   GET /api/reviews/:productId
 * @access  Public
 */
export const getApprovedReviews = async (req, res) => {
    const productId = req.params.productId;

    try {
        const { data, error } = await supabase
            .from('product_reviews')
            .select('id, user_name, rating, comment, created_at') // Select specific fields
            .eq('product_id', productId)
            .eq('is_approved', true) // Only approved reviews
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);

    } catch (error) {
        console.error("Get Reviews Error:", error);
        res.status(500).json({ message: error.message });
    }
};


/**
 * @desc    Admin: Get all reviews (for approval)
 * @route   GET /api/reviews/admin/all
 * @access  Admin
 */
export const getAllReviewsAdmin = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_reviews')
            .select('*, products(name)') // Include product name
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error("Admin Get Reviews Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Admin: Approve a review
 * @route   PUT /api/reviews/admin/approve/:reviewId
 * @access  Admin
 */
export const approveReviewAdmin = async (req, res) => {
    const reviewId = req.params.reviewId;
    try {
        const { data, error } = await supabase
            .from('product_reviews')
            .update({ is_approved: true })
            .eq('id', reviewId)
            .select()
            .single();
            
        if (error) throw error;
        if (!data) return res.status(404).json({ message: 'Review not found' });

        // Optional: Recalculate and update product's average rating here

        res.json({ message: 'Review approved', review: data });
    } catch (error) {
        console.error("Approve Review Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Admin: Delete a review
 * @route   DELETE /api/reviews/admin/:reviewId
 * @access  Admin
 */
export const deleteReviewAdmin = async (req, res) => {
    const reviewId = req.params.reviewId;
     try {
        const { error } = await supabase
            .from('product_reviews')
            .delete()
            .eq('id', reviewId);
            
        if (error) throw error;

        // Optional: Recalculate and update product's average rating here

        res.json({ message: 'Review deleted' });
    } catch (error) {
        console.error("Delete Review Error:", error);
        res.status(500).json({ message: error.message });
    }
};