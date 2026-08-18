declare module "react-native-razorpay" {
  export type RazorpaySuccessResponse = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  };
  export type RazorpayErrorResponse = {
    code: number;
    description: string;
  };
  const RazorpayCheckout: {
    open: (options: any) => Promise<RazorpaySuccessResponse>;
  };
  export default RazorpayCheckout;
}
