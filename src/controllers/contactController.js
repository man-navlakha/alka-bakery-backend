import { supabase } from "../config/supabase.js";
import { transporter } from "../config/nodemailer.js";

export const sendContactMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message)
      return res.status(400).json({ message: "All fields are required" });

    // Save to Supabase
    const { data, error } = await supabase
      .from("contacts")
      .insert([{ name, email, message }])
      .select()
      .single();

    if (error) throw error;

    // Send email
    const mailOptions = {
      from: `"${name}" <${email}>`,
      to: process.env.EMAIL_USER,
      subject: `New Inquiry from ${name}`,
      html: `
        <h2>New Contact Inquiry</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({
      message: "Your message has been sent successfully!",
      contact: data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send message", error: error.message });
  }
};
