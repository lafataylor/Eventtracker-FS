#!/usr/bin/env python3
"""
Test script for the Instagram link endpoint.
This script demonstrates how to use the new create_event_from_instagram_link endpoint.
"""

import requests
import json

def test_instagram_endpoint():
    """Test the Instagram endpoint with a sample Instagram post URL."""
    
    # The endpoint URL (adjust the host as needed)
    url = "http://127.0.0.1:8000/v1/admin/createEventFromInstagram/"
    
    # Sample Instagram post URLs for testing
    # Note: Replace these with actual Instagram post URLs that contain event information
    test_urls = [
        "https://www.instagram.com/p/EXAMPLE_POST_ID/",  # Replace with actual post
        "https://www.instagram.com/reel/EXAMPLE_REEL_ID/",  # Replace with actual reel
    ]
    
    for instagram_url in test_urls:
        print(f"\nTesting Instagram URL: {instagram_url}")
        
        # Prepare the payload
        payload = {
            "instagram_url": instagram_url
        }
        
        # Make the POST request
        try:
            response = requests.post(url, json=payload)
            
            print(f"Status Code: {response.status_code}")
            print(f"Response: {json.dumps(response.json(), indent=2)}")
            
            if response.status_code == 200:
                print("✓ Success! Event created from Instagram post.")
            else:
                print("✗ Failed to create event.")
                
        except requests.exceptions.RequestException as e:
            print(f"✗ Request failed: {e}")
        except json.JSONDecodeError:
            print(f"✗ Invalid JSON response: {response.text}")
        
        print("-" * 50)

def test_invalid_urls():
    """Test the endpoint with invalid URLs to verify error handling."""
    
    url = "http://127.0.0.1:8000/v1/admin/createEventFromInstagram/"
    
    invalid_urls = [
        "https://www.facebook.com/post/123",  # Wrong platform
        "https://www.instagram.com/user/",    # Not a post URL
        "invalid_url",                        # Invalid URL format
        "",                                   # Empty URL
    ]
    
    print("\nTesting invalid URLs:")
    
    for invalid_url in invalid_urls:
        print(f"\nTesting invalid URL: {invalid_url}")
        
        payload = {
            "instagram_url": invalid_url
        }
        
        try:
            response = requests.post(url, json=payload)
            print(f"Status Code: {response.status_code}")
            print(f"Response: {json.dumps(response.json(), indent=2)}")
            
        except requests.exceptions.RequestException as e:
            print(f"✗ Request failed: {e}")
        except json.JSONDecodeError:
            print(f"✗ Invalid JSON response: {response.text}")

if __name__ == "__main__":
    print("Instagram Event Creation Endpoint Test")
    print("=" * 50)
    
    # Test with valid Instagram URLs
    test_instagram_endpoint()
    
    # Test with invalid URLs
    test_invalid_urls() 