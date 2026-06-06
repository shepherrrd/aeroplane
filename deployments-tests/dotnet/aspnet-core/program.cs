var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

app.MapGet("/", () => Results.Text("hello from dotnet aspnet core\n", "text/plain"));
app.MapGet("/health", () => Results.Json(new
{
  status = "ok",
  framework = "aspnet-core",
  runtime = "dotnet"
}));

app.Run();
