#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(readr)
})

args <- commandArgs(trailingOnly = TRUE)
lock_file <- ifelse(length(args) >= 1, args[[1]], "analysis/r-packages.lock.csv")

pkgs <- read_csv(lock_file, show_col_types = FALSE)

if (!all(c("package", "version") %in% names(pkgs))) {
  stop("Lock file must include columns: package, version", call. = FALSE)
}

if (!requireNamespace("remotes", quietly = TRUE)) {
  install.packages("remotes")
}

for (i in seq_len(nrow(pkgs))) {
  pkg <- pkgs$package[[i]]
  ver <- pkgs$version[[i]]
  message(sprintf("Installing %s (%s)", pkg, ver))
  remotes::install_version(pkg, version = ver, upgrade = "never", quiet = TRUE)
}

message("Package installation from lock file completed.")
