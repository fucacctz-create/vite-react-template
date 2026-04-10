import { useEffect } from "react";

function App() {
	useEffect(() => {
		window.location.replace("/flatfinder-landing.html");
	}, []);

	return (
		<div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
			Redirecting to FlatFinder landing page...
		</div>
	);
}

export default App;
