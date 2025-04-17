package main

// This is a sample version file with an inline template

// %%release-manager: const Version = "v{{version}}"%%
const Version = "v0.1.0"

// Multi-line template example
/* %%release-manager:
const Major = "{{major}}"
const Minor = "{{minor}}"
const Patch = "{{patch}}"
%% */
const Major = "0"
const Minor = "1"
const Patch = "0"

func main() {
    println("Current version:", Version)
}
