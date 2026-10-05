export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Privacy policy</h1>
      <p className="text-sm mb-4 italic">Last updated: 16/11/25</p>

      <p className="mb-4">
        This privacy policy explains how linguil (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, discloses, and safeguards your information when you use our web application.
        We are committed to protecting your privacy and providing transparency about our data practices.
      </p>

      <h2 className="text-2xl font-bold mt-6 mb-4">1. Information we collect</h2>
      <p className="mb-4">We collect information to provide and improve our service. The types of information we collect are:</p>

      <h3 className="text-xl font-semibold mt-4 mb-2">A. Personal information you provide</h3>
      <ul className="list-disc list-inside mb-4 pl-4">
        <li><strong>UID:</strong> We collect your unique Reddit UID when you register for an account. We use this for account creation, authentication, communication, and to link linguil+ to your account.</li>
        <li><strong>(Display) name:</strong> We collect your name during registration or from your Google account to personalise your leaderboard.</li>
        <li><strong>Profile picture URL:</strong> If you sign in with Google, we collect the URL to your profile picture to display within the application.</li>
        <li><strong>Password:</strong> For users who sign up with email, we store a secure, hashed version of your password. We cannot see your plain-text password.</li>
      </ul>

      <h3 className="text-xl font-semibold mt-4 mb-2">B. User-generated data</h3>
      <ul className="list-disc list-inside mb-4 pl-4">
        <li><strong>Game scores:</strong> We collect and store your scores from daily games, including perfect scores and total correct answers. This is displayed on your leaderboard.</li>
        <li><strong>Friend code:</strong> We generate a shareable unique identifier (your user ID) that allows other users to view your display name and leaderboard data.</li>
      </ul>

      <h3 className="text-xl font-semibold mt-4 mb-2">C. Analytics data</h3>
      <ul className="list-disc list-inside mb-4 pl-4">
        <li><strong>Usage information:</strong> We use Reddit&apos;s Devvit Journeys analytics to track gameplay flow and player progression through the app.</li>
        <li><strong>Payments:</strong> We track completed Reddit Gold purchases for enhanced record-keeping and growth analytics.</li>
      </ul>

      <h2 className="text-2xl font-bold mt-6 mb-4">2. How we use your information</h2>
      <p className="mb-4">Our primary goal is to provide a personalised and engaging experience. We use your information to:</p>
      <ul className="list-disc list-inside mb-4 pl-4">
        <li>Create, maintain, and secure your account.</li>
        <li>Authenticate your access to the application.</li>
        <li>Display your public leaderboard data, including your display name, photo, and game scores.</li>
        <li>Process one-time payments and manage your linguil+ status using Reddit Gold (via Stripe).</li>
        <li>Analyse gameplay progression and optimise the user experience via Devvit Journeys.</li>
      </ul>

      <h2 className="text-2xl font-bold mt-6 mb-4">3. Sharing your information with third parties</h2>
      <p className="mb-4">We do not sell your personal data. We only share it with essential third-party service providers that perform services for us or on our behalf. These include:</p>
      <ul className="list-disc list-inside mb-4 pl-4">
        <li><strong>Google / Firebase:</strong> We use Google services for user authentication, data storage (Firestore), and hosting. When you use our app, you are providing information directly to Google as governed by their own privacy policy.</li>
        <li><strong>Reddit:</strong> The app runs on the Reddit Developer Platform (Devvit). Reddit manages UIDs, platform telemetry, Reddit Gold transactions, and gameplay analytics via Devvit Journeys.</li>
        <li><strong>Stripe:</strong> Reddit uses Stripe for Reddit Gold payment processing. If you choose to upgrade to linguil+, Reddit provides your UID to Stripe to create a customer record. We do not process or store your financial or credit card details on our servers.</li>
      </ul>

      <h2 className="text-2xl font-bold mt-6 mb-4">4. Data security</h2>
      <p className="mb-4">
        We are committed to protecting your data. We leverage the robust security measures of Google Cloud and Firebase to store and protect your information. This includes measures to prevent unauthorised access, alteration, or disclosure.
      </p>

      <h2 className="text-2xl font-bold mt-6 mb-4">5. Your choices and rights</h2>
      <p className="mb-4">
        You can review and update your account information at any time. You also have the right to delete your account, which will remove your personal and public data from our active databases, subject to our data retention policies for legal and security reasons.
      </p>

      <h2 className="text-2xl font-bold mt-6 mb-4">6. Contact us</h2>
      <p className="mb-12">
        If you have any questions or concerns about this privacy policy, please contact us at <a href="mailto:charliemccombie@gmail.com" className="text-blue-600 hover:underline">charliemccombie@gmail.com</a>.
      </p>
    </main>
  );
}