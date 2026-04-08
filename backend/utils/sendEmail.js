const sendEmail = async (options) => {
  // Hardcoded to only console log the password reset links directly to the terminal
  // so the application never crashes in free tier testing.
  console.log("\n=============================================");
  console.log(`[EMAIL BYPASSED] Intended for: ${options.email}`);
  console.log(`SUBJECT: ${options.subject}`);
  console.log(`MESSAGE:\n${options.message}`);
  console.log("=============================================\n");
  
  // Just return true to allow password resets testing easily
  return true;
};

module.exports = sendEmail;
