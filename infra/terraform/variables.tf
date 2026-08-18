variable "tenancy_ocid" {
  description = "OCID of your OCI tenancy"
  type        = string
}

variable "compartment_ocid" {
  description = "OCID of the compartment to deploy into"
  type        = string
}

variable "region" {
  description = "OCI region (e.g. eu-frankfurt-1, us-ashburn-1)"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key string for VM access (e.g. 'ssh-ed25519 AAAA...')"
  type        = string
}

variable "duckdns_token" {
  description = "DuckDNS API token from duckdns.org"
  type        = string
  sensitive   = true
}

variable "duckdns_subdomain" {
  description = "DuckDNS subdomain (just the name, not .duckdns.org)"
  type        = string
}

variable "repo_url" {
  description = "Git repository URL to clone on the VM (https or ssh)"
  type        = string
}
