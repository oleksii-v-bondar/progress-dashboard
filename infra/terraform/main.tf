terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

provider "oci" {
  tenancy_ocid = var.tenancy_ocid
  region       = var.region
  # Uses ~/.oci/config default profile — no credentials in code
}

# ── Data sources ──────────────────────────────────────────────────────────────

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.tenancy_ocid
}

# ── Networking ────────────────────────────────────────────────────────────────

resource "oci_core_vcn" "app" {
  compartment_id = var.compartment_ocid
  cidr_block     = "10.0.0.0/16"
  display_name   = "progress-app-vcn"
  dns_label      = "progressapp"
}

resource "oci_core_internet_gateway" "app" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.app.id
  display_name   = "progress-app-igw"
}

resource "oci_core_route_table" "app" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.app.id
  display_name   = "progress-app-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.app.id
  }
}

resource "oci_core_security_list" "app" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.app.id
  display_name   = "progress-app-sl"

  # Allow all outbound
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # SSH
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTP
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  # HTTPS
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_subnet" "app" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.app.id
  cidr_block        = "10.0.1.0/24"
  display_name      = "progress-app-subnet"
  dns_label         = "app"
  route_table_id    = oci_core_route_table.app.id
  security_list_ids = [oci_core_security_list.app.id]
}

# ── Compute ───────────────────────────────────────────────────────────────────

resource "oci_core_instance" "app" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "progress-app"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = 2
    memory_in_gbs = 12
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu_arm.images[0].id
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.app.id
    assign_public_ip = true
    display_name     = "progress-app-vnic"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/user_data.sh", {
      duckdns_token     = var.duckdns_token
      duckdns_subdomain = var.duckdns_subdomain
      repo_url          = var.repo_url
      bucket_name       = oci_objectstorage_bucket.backups.name
      namespace         = data.oci_objectstorage_namespace.ns.namespace
    }))
  }
}

# ── Block Volume ──────────────────────────────────────────────────────────────

resource "oci_core_volume" "data" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "progress-app-data"
  size_in_gbs         = 50
}

resource "oci_core_volume_attachment" "data" {
  attachment_type = "paravirtualized"
  instance_id     = oci_core_instance.app.id
  volume_id       = oci_core_volume.data.id
  display_name    = "progress-app-data-attachment"
}

# ── Object Storage ────────────────────────────────────────────────────────────

resource "oci_objectstorage_bucket" "backups" {
  compartment_id = var.compartment_ocid
  name           = "progress-app-backups"
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
}

# ── IAM: Instance Principal for Object Storage ────────────────────────────────

resource "oci_identity_dynamic_group" "app_instance" {
  compartment_id = var.tenancy_ocid
  name           = "progress-app-instances"
  description    = "Dynamic group for progress-app VM instance principal"
  matching_rule  = "instance.id = '${oci_core_instance.app.id}'"
}

resource "oci_identity_policy" "instance_object_storage" {
  compartment_id = var.tenancy_ocid
  name           = "progress-app-instance-storage"
  description    = "Allow progress-app VM to write pg_dump backups to object storage"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.app_instance.name} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${oci_objectstorage_bucket.backups.name}'"
  ]
}
