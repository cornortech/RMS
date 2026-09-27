require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const RestaurantUser = require("./models/login"); 

async function createAdmin() {
    try {
        // Check all common names for the MongoDB connection string in your .env file
        const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

        if (!mongoURI) {
            console.error("❌ Error: No MongoDB connection string found in your backend/.env file!");
            console.error("Please ensure you have MONGO_URI=... or MONGODB_URI=... set in your .env file.");
            process.exit(1);
        }

        console.log("Connecting to MongoDB...");
        await mongoose.connect(mongoURI);
        console.log("✅ Connected to MongoDB successfully!");

        // Check if an admin already exists
        const existing = await RestaurantUser.findOne({ isAdmin: true });
        if (existing) {
            console.log("⚠️ An admin account already exists in this database!");
            process.exit(0);
        }

        // Hash password securely
                const adminId = (process.env.ADMIN_ID || "").trim();
        const adminPassword = process.env.ADMIN_PASSWORD || "";
        if (!adminId || adminPassword.length < 12) {
            console.error("❌ Set ADMIN_ID and ADMIN_PASSWORD (at least 12 characters) in backend/.env first.");
            process.exit(1);
        }
        const hashedPassword = await bcrypt.hash(adminPassword, 12);

        // Create the master admin account
        await RestaurantUser.create({
            restaurantName: "Admin",
            id: adminId,
            password: hashedPassword,
            phone: "9800000000",
            email: "admin@gmail.com",
            location: "Central City",
            PanOrVat: "123456789",
            isAdmin: true,
            isActive: true
        });

        process.exit(0);
    } catch (err) {
        console.error("❌ Error creating admin:", err.message);
        process.exit(1);
    }
}

createAdmin();