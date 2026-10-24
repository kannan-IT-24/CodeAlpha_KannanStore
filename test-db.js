require("dotenv").config();
const { MongoClient } = require("mongodb");

async function testConnection() {
    console.log("--- MongoDB Atlas Safe Connection Tester ---");
    const rawUri = process.env.MONGODB_URI;

    if (!rawUri) {
        console.error("❌ MONGODB_URI is missing in .env file.");
        process.exit(1);
    }

    const trimmedUri = rawUri.trim();

    // Check for common formatting mistakes without exposing secrets
    if (trimmedUri.includes("<") || trimmedUri.includes(">")) {
        console.warn("⚠️ Warning: Your MONGODB_URI contains '<' or '>'. Make sure you replaced '<password>' with your actual password and removed the brackets.");
    }
    if (rawUri.startsWith('"') || rawUri.startsWith("'")) {
        console.warn("ℹ️ Note: Your MONGODB_URI has surrounding quotation marks. While dotenv often handles this, quotes are not required.");
    }

    // Safely parse URI to display non-sensitive diagnostics
    try {
        // Safe regex to extract scheme, user, and host without printing password
        const srvMatch = trimmedUri.match(/^(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@([^/?]+)(.*)$/);
        if (srvMatch) {
            const [, scheme, username, , host, rest] = srvMatch;
            console.log(`Scheme:    ${scheme}`);
            console.log(`Username:  ${username}`);
            console.log(`Password:  ******** (masked for security)`);
            console.log(`Cluster:   ${host}`);
            const dbPart = rest.split("?")[0].replace(/^\//, "");
            console.log(`Database:  ${dbPart || "(default: admin / not specified in path)"}`);
        } else {
            console.log("URI Format: Custom / Sharded connection string");
        }
    } catch {
        console.log("Could not parse URI metadata.");
    }

    console.log("\nConnecting to MongoDB Atlas...");
    const client = new MongoClient(trimmedUri, {
        serverSelectionTimeoutMS: 5000,
    });

    try {
        await client.connect();
        console.log("✅ SUCCESS: Successfully connected and authenticated to MongoDB Atlas!");
        const db = client.db("kannanstore");
        const pingResult = await db.command({ ping: 1 });
        console.log("✅ Cluster Ping:", pingResult);
        await client.close();
        process.exit(0);
    } catch (error) {
        console.error("❌ CONNECTION FAILED");
        console.error("Error Name:   ", error.name);
        console.error("Error Code:   ", error.code);
        console.error("Error Message:", error.message);

        if (error.code === 8000 || error.message.includes("authentication failed")) {
            console.error("\n👉 DIAGNOSIS: Authentication Failed (Code 8000)");
            console.error("- The network reached your Atlas cluster, but Atlas rejected the credentials.");
            console.error("- The password in your .env does not match the database user's password in Atlas.");
            console.error("- Reset the password in Atlas: Security -> Database Access -> Edit user -> Edit password.");
        } else if (error.message.includes("ETIMEDOUT") || error.message.includes("ENOTFOUND")) {
            console.error("\n👉 DIAGNOSIS: Network or DNS issue");
            console.error("- Check Atlas: Security -> Network Access -> IP Access List.");
        }
        await client.close().catch(() => { });
        process.exit(1);
    }
}

testConnection();
