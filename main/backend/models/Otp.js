import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 } // 5 minutes TTL
});

const Otp = mongoose.models.Otp || mongoose.model('Otp', otpSchema);
export default Otp;
