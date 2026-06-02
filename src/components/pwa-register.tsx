"use client";

import { useEffect } from "react";

export function PwaRegister() {
	useEffect(() => {
		if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
			return;
		}

		const register = () => {
			navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
				// PWA install support is progressive; app UX should not depend on it.
			});
		};

		if (document.readyState === "complete") {
			register();
			return;
		}

		window.addEventListener("load", register, { once: true });

		return () => window.removeEventListener("load", register);
	}, []);

	return null;
}
