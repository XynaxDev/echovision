import asyncio
import time
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv("d:/echovision-app/backend/.env")

api_key = os.getenv("NVIDIA_API_KEY")
if not api_key:
    print("❌ No NVIDIA_API_KEY found in .env")
    exit(1)

client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1", 
    api_key=api_key
)

async def test_latency():
    print("🚀 Sending test request to NVIDIA NIM...")
    start_time = time.time()
    
    try:
        response = await client.chat.completions.create(
            model="meta/llama-3.2-11b-vision-instruct",
            messages=[{"role": "user", "content": "Hello, this is a latency test. Reply with 'ACK'."}],
            temperature=0.1,
            max_tokens=10,
            stream=True
        )
        
        first_token = False
        async for chunk in response:
            if not first_token:
                ttfb = time.time() - start_time
                print(f"⏱️ Time to First Byte (TTFB): {ttfb * 1000:.2f}ms")
                first_token = True
            token = chunk.choices[0].delta.content
            if token:
                print(token, end="", flush=True)
                
        total_time = time.time() - start_time
        print(f"\n✅ Total response time: {total_time * 1000:.2f}ms")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_latency())
