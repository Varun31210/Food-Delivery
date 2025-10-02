import mongoose from "mongoose";

export const connectDb = async () => {
    await mongoose.connect('mongodb+srv://VARUN:Varun123@cluster0.mjuknaw.mongodb.net/Food-Del').then(()=>console.log("DB Connected"))
}