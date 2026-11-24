using System.Net;
using System.Net.Http.Json;
using Fixture.Api.Items;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Fixture.Api.Tests;

/// <summary>Runs the API against the SQL Server from ConnectionStrings__Default (the CI service container).</summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public async ValueTask InitializeAsync()
    {
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ConnectionStrings__Default")))
            throw new InvalidOperationException("Set ConnectionStrings__Default to a SQL Server test database (the fixtures workflow does).");
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<FixtureDbContext>().Database.MigrateAsync();
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        GC.SuppressFinalize(this);
    }
}

public sealed class ItemEndpointsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Creates_an_item_and_reads_it_back()
    {
        var client = factory.CreateClient();
        var created = await client.PostAsJsonAsync("/api/items", new { name = "Drill" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var item = await created.Content.ReadFromJsonAsync<ItemDto>(TestContext.Current.CancellationToken);
        var read = await client.GetFromJsonAsync<ItemDto>($"/api/items/{item!.Id}", TestContext.Current.CancellationToken);
        Assert.Equal("Drill", read!.Name);
    }

    [Fact]
    public async Task Rejects_an_empty_name_with_a_validation_problem()
    {
        var response = await factory.CreateClient().PostAsJsonAsync("/api/items", new { name = "" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Returns_404_for_an_unknown_item()
    {
        var response = await factory.CreateClient().GetAsync($"/api/items/{Guid.NewGuid()}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
