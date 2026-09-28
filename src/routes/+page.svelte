<script lang="ts">
</script>

<div class="min-h-dvh bg-base-100">
	<div class="flex min-h-dvh w-full">
		<aside
			class="sticky top-0 h-dvh w-72 shrink-0 overflow-hidden bg-slate-900 text-base-100 sm:w-80 lg:w-105"
		>
			<div
				class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(22,163,74,0.16),transparent_45%)]"
			></div>
			<div class="relative flex h-full w-full flex-col justify-between p-16">
				<div class="space-y-10">
					<div
						class="flex h-24 w-24 items-center justify-center rounded-full bg-green-700 text-4xl font-bold tracking-wide text-white"
					>
						BPC
					</div>

					<div class="space-y-3">
						<h2 class="text-5xl leading-tight font-black tracking-tight text-white uppercase">
							Bulacan Polytechnic College
						</h2>
						<p class="text-lg tracking-widest text-slate-300 uppercase">
							College Enrollment System
						</p>
					</div>
				</div>

				<div class="rounded-2xl border border-slate-600/60 bg-slate-800/60 p-8 backdrop-blur-sm">
					<p class="text-center text-sm font-semibold tracking-wider text-slate-100 uppercase">
						Secure • Simple • Centralized
					</p>
					<p class="mt-4 text-center text-sm text-slate-300">
						Registrar-assisted enrollment workflow
					</p>
				</div>
			</div>
		</aside>

		<main
			class="flex min-w-0 flex-1 items-center justify-center bg-slate-50 px-4 py-10 sm:px-8 lg:px-14"
		>
			<div class="w-full space-y-8">
				<header class="space-y-2">
					<h1 class="text-4xl font-extrabold tracking-tight text-slate-800 sm:text-5xl">
						BPC Enrollment Portal
					</h1>
					<p class="text-xl text-slate-500">Student / Registrar Login</p>
				</header>

				<section class="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
					<form class="space-y-7">
						<div class="space-y-2">
							<label class="text-sm font-bold tracking-wide text-slate-500 uppercase" for="email"
								>Email</label
							>
							<input
								id="email"
								type="email"
								placeholder="student@email.com"
								class="input-bordered input h-14 w-full rounded-lg border-slate-200 bg-white text-lg text-slate-700 placeholder:text-slate-400 focus:border-green-700 focus:outline-none"
								required
							/>
						</div>

						<div class="space-y-2">
							<label class="text-sm font-bold tracking-wide text-slate-500 uppercase" for="password"
								>Password</label
							>
							<input
								id="password"
								type="password"
								placeholder="••••••••"
								class="input-bordered input h-14 w-full rounded-lg border-slate-200 bg-white text-lg text-slate-700 placeholder:text-slate-400 focus:border-green-700 focus:outline-none"
								required
							/>
						</div>

						<button
							type="submit"
							class="btn h-14 w-full border-none bg-green-700 text-base font-bold tracking-wide text-white hover:bg-green-800"
						>
							LOGIN
						</button>

						<div>
							<a
								href="/"
								class="text-sm font-semibold text-green-700 hover:text-green-800 hover:underline"
								>Forgot Password?</a
							>
						</div>

						<p class="pt-4 text-sm text-slate-400">
							Incoming first-year applicants: submit requirements physically to the Registrar's
							Office.
						</p>
					</form>
				</section>
			</div>
		</main>
	</div>
</div>
