import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import foodModel from "../models/foodModel.js"; // assuming you have this
import Stripe from "stripe";
import mongoose from "mongoose";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Place order (frontend)
const placeOrder = async (req, res) => {
    const frontend_url = "http://localhost:5174";

    try {
        const { userId, items, address } = req.body;

        // Validate userId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Invalid User ID" });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        // Calculate line_items for Stripe
        const line_items = [];
        let totalAmountPaise = 0;
        const conversionRate = 80; // USD → INR

        for (const item of items) {
            if (!mongoose.Types.ObjectId.isValid(item._id)) continue;

            const product = await foodModel.findById(item._id);
            if (!product) continue;

            const unitAmountPaise = product.price * conversionRate * 100;
            totalAmountPaise += unitAmountPaise * item.quantity;

            line_items.push({
                price_data: {
                    currency: "inr",
                    product_data: { name: product.name },
                    unit_amount: unitAmountPaise
                },
                quantity: item.quantity
            });
        }

        // Add delivery fee (₹160 paise)
        const deliveryFeePaise = 2 * conversionRate * 100;
        line_items.push({
            price_data: {
                currency: "inr",
                product_data: { name: "Delivery Charges" },
                unit_amount: deliveryFeePaise
            },
            quantity: 1
        });
        totalAmountPaise += deliveryFeePaise;

        // Minimum amount check ₹50
        if (totalAmountPaise < 5000) {
            return res.status(400).json({ success: false, message: "Minimum order amount is ₹50. Please add more items." });
        }

        // Save order in DB
        const newOrder = new orderModel({
            userId,
            items,
            amount: totalAmountPaise / 100, // store in INR
            address
        });
        await newOrder.save();

        // Clear user's cart
        await userModel.findByIdAndUpdate(userId, { cartData: {} });

        // Create Stripe session
        const session = await stripe.checkout.sessions.create({
            line_items,
            mode: 'payment',
            success_url: `${frontend_url}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url: `${frontend_url}/verify?success=false&orderId=${newOrder._id}`
        });

        res.json({ success: true, session_url: session.url });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Verify order payment
const verifyOrder = async (req, res) => {
    try {
        const { orderId, success } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: "Invalid order ID" });
        }

        if (success === "true") {
            await orderModel.findByIdAndUpdate(orderId, { payment: true });
            res.json({ success: true, message: "Payment Successful" });
        } else {
            await orderModel.findByIdAndDelete(orderId);
            res.json({ success: false, message: "Payment Failed / Order Cancelled" });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// User orders (frontend)
const userOrders = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Invalid User ID" });
        }

        const orders = await orderModel.find({ userId });
        res.json({ success: true, data: orders });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// List all orders (admin)
const listOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({});
        res.json({ success: true, data: orders });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Update order status (admin)
const updateStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: "Invalid Order ID" });
        }

        await orderModel.findByIdAndUpdate(orderId, { status });
        res.json({ success: true, message: "Order status updated" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

export { placeOrder, verifyOrder, userOrders, listOrders, updateStatus };
