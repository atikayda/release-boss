package main

// This is a sample version file with an inline template

// %%release-manager: const Version = "v{{version}}"%%
const Version = "v1.2.3"

// Multi-line template example
/* %%release-manager:
const Major = "{{major}}"
const Minor = "{{minor}}"
const Patch = "{{patch}}"
%% */
const Major = "1"
const Minor = "2"
const Patch = "3"

func main() {
    println("Current version:", Version)
}
